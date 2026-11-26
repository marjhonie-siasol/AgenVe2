from __future__ import annotations

import asyncio
import json
import shutil
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from agenve2.core.models import Decision, EvaluationReport, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PolicyLoader
from agenve2.plugins.secret_scanner import sanitize_untrusted_output
from agenve2.storage.repository import SQLModelAuditRepository


class MCPStdioProxy:
    """Transparent JSON-RPC stdio proxy intercepting MCP tools/call requests."""

    def __init__(
        self,
        target_command: list[str],
        policy_path: str | Path | None = None,
        daemon_url: str | None = "http://127.0.0.1:8080",
        agent_name: str = "mcp-client",
        database_url: str | None = None,
        redact_outputs: bool = True,
        auto_start: bool = False,
    ) -> None:
        if not target_command:
            raise ValueError("target_command must not be empty.")
        self.target_command = target_command
        self.daemon_url = daemon_url.rstrip("/") if daemon_url else None
        self.agent_name = agent_name
        self.redact_outputs = redact_outputs
        self.auto_start = auto_start
        self.policy_loader = PolicyLoader(policy_path)
        self.repository = SQLModelAuditRepository(database_url)
        self.local_pipeline = EvaluationPipeline(
            policy_loader=self.policy_loader,
            kill_switch=self.repository.get_kill_switch(),
        )
        self._tool_call_ids: set[Any] = set()
        self._auto_start_attempted = False

    async def _ensure_daemon_running(self) -> None:
        if not self.auto_start or not self.daemon_url or self._auto_start_attempted:
            return
        self._auto_start_attempted = True
        parsed = urlparse(self.daemon_url)
        if parsed.hostname not in {"127.0.0.1", "localhost"}:
            return
        try:
            async with httpx.AsyncClient(timeout=0.5) as client:
                if (await client.get(f"{self.daemon_url}/api/health")).status_code == 200:
                    return
        except httpx.HTTPError:
            pass

        cmd = [
            sys.executable,
            "-m",
            "agenve2.cli",
            "start",
            "--host",
            parsed.hostname or "127.0.0.1",
            "--port",
            str(parsed.port or 8080),
        ]
        if self.policy_loader.path:
            cmd.extend(["--policy", str(self.policy_loader.path)])
        await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )
        for _ in range(16):
            await asyncio.sleep(0.25)
            try:
                async with httpx.AsyncClient(timeout=0.5) as client:
                    if (await client.get(f"{self.daemon_url}/api/health")).status_code == 200:
                        return
            except httpx.HTTPError:
                continue

    async def evaluate_call(
        self, tool_name: str, arguments: dict[str, Any]
    ) -> tuple[bool, str]:
        await self._ensure_daemon_running()
        req = ToolCallRequest(
            agent_name=self.agent_name,
            tool_name=tool_name,
            arguments=arguments,
        )

        # Prefer running daemon so approvals & live dashboard feed work in real time
        if self.daemon_url:
            timeout_sec = self.policy_loader.config.defaults.approval_timeout_seconds + 15
            try:
                async with httpx.AsyncClient(timeout=timeout_sec) as client:
                    resp = await client.post(
                        f"{self.daemon_url}/api/evaluate",
                        json=req.model_dump(mode="json"),
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        eff = data.get("effective_decision", Decision.BLOCK.value)
                        allowed = eff in (Decision.ALLOW.value, Decision.APPROVED.value)
                        return allowed, data.get("reason", "Blocked by AgenVe2 policy.")
            except httpx.HTTPError:
                pass

        # Fallback: local fail-closed in-process evaluation
        self.local_pipeline.kill_switch = self.repository.get_kill_switch()
        report: EvaluationReport = self.local_pipeline.evaluate(req)
        if report.effective_decision == Decision.REQUIRE_APPROVAL:
            report.effective_decision = Decision.BLOCK
            report.reason = (
                "Fail-closed: action requires human approval, but AgenVe2 daemon "
                f"({self.daemon_url}) is not reachable. Run 'agenve2 start' first."
            )
        self.repository.record_evaluation(report)
        allowed = report.effective_decision in (Decision.ALLOW, Decision.APPROVED)
        return allowed, report.reason

    def _build_blocked_mcp_response(self, msg_id: Any, reason: str) -> bytes:
        payload = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "isError": True,
                "content": [
                    {
                        "type": "text",
                        "text": f"[AGENVE2 BLOCKED] {reason}",
                    }
                ],
            },
        }
        return (json.dumps(payload) + "\n").encode("utf-8")

    async def process_client_line(self, raw_line: bytes) -> tuple[bool, bytes]:
        """Inspect a single JSON-RPC line from client -> target server.

        Returns (forward_to_server, bytes_to_write).
        If forward_to_server is False, bytes_to_write should be sent directly to client stdout.
        """
        stripped = raw_line.strip()
        if not stripped:
            return True, raw_line

        try:
            msg = json.loads(stripped.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return True, raw_line

        if isinstance(msg, dict) and msg.get("method") == "tools/call":
            msg_id = msg.get("id")
            params = msg.get("params") or {}
            tool_name = str(params.get("name", ""))
            arguments = params.get("arguments")
            if not isinstance(arguments, dict):
                arguments = {}

            allowed, reason = await self.evaluate_call(tool_name, arguments)
            if not allowed:
                return False, self._build_blocked_mcp_response(msg_id, reason)
            if msg_id is not None:
                self._tool_call_ids.add(msg_id)

        return True, raw_line

    def process_server_line(self, raw_line: bytes) -> bytes:
        """Inspect and redact secrets from outbound MCP tools/call responses."""
        if not self.redact_outputs:
            return raw_line
        stripped = raw_line.strip()
        if not stripped:
            return raw_line

        try:
            msg = json.loads(stripped.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw_line

        if not isinstance(msg, dict) or "result" not in msg:
            return raw_line

        msg_id = msg.get("id")
        if msg_id not in self._tool_call_ids:
            return raw_line
        self._tool_call_ids.discard(msg_id)

        redacted_result = sanitize_untrusted_output(msg["result"])
        if redacted_result == msg["result"]:
            return raw_line

        msg["result"] = redacted_result
        return (json.dumps(msg) + "\n").encode("utf-8")

    def _resolve_target_command(self) -> list[str]:
        cmd = list(self.target_command)
        resolved = shutil.which(cmd[0])
        if resolved:
            cmd[0] = resolved
        return cmd

    async def _forward_client_line(
        self,
        raw_line: bytes,
        proc: asyncio.subprocess.Process,
        stdin_lock: asyncio.Lock,
        stdout_lock: asyncio.Lock,
    ) -> None:
        should_forward, out_bytes = await self.process_client_line(raw_line)
        if should_forward:
            assert proc.stdin is not None
            async with stdin_lock:
                proc.stdin.write(out_bytes)
                await proc.stdin.drain()
        else:
            async with stdout_lock:
                sys.stdout.buffer.write(out_bytes)
                sys.stdout.buffer.flush()

    async def run(self) -> int:
        proc = await asyncio.create_subprocess_exec(
            *self._resolve_target_command(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=sys.stderr,
        )
        assert proc.stdin is not None and proc.stdout is not None

        stdin_lock = asyncio.Lock()
        stdout_lock = asyncio.Lock()
        in_flight: set[asyncio.Task[None]] = set()

        async def pump_server_to_client() -> None:
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                sanitized = self.process_server_line(line)
                async with stdout_lock:
                    sys.stdout.buffer.write(sanitized)
                    sys.stdout.buffer.flush()

        async def pump_client_to_server() -> None:
            assert proc.stdin is not None
            loop = asyncio.get_running_loop()
            while True:
                line = await loop.run_in_executor(None, sys.stdin.buffer.readline)
                if not line:
                    break
                # Dispatch tool calls concurrently so approval waits don't stall stdin
                task = asyncio.create_task(
                    self._forward_client_line(line, proc, stdin_lock, stdout_lock)
                )
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)

            if in_flight:
                await asyncio.gather(*list(in_flight), return_exceptions=True)
            proc.stdin.close()

        await asyncio.gather(pump_server_to_client(), pump_client_to_server())
        return await proc.wait()


async def run_mcp_proxy(
    target_command: list[str],
    policy_path: str | Path | None = None,
    daemon_url: str | None = "http://127.0.0.1:8080",
    agent_name: str = "mcp-client",
    auto_start: bool = False,
) -> int:
    proxy = MCPStdioProxy(
        target_command=target_command,
        policy_path=policy_path,
        daemon_url=daemon_url,
        agent_name=agent_name,
        auto_start=auto_start,
    )
    return await proxy.run()
