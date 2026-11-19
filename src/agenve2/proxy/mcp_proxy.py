from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import httpx

from agenve2.core.models import Decision, EvaluationReport, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PolicyLoader
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
    ) -> None:
        if not target_command:
            raise ValueError("target_command must not be empty.")
        self.target_command = target_command
        self.daemon_url = daemon_url.rstrip("/") if daemon_url else None
        self.agent_name = agent_name
        self.policy_loader = PolicyLoader(policy_path)
        self.repository = SQLModelAuditRepository(database_url)
        self.local_pipeline = EvaluationPipeline(
            policy_loader=self.policy_loader,
            kill_switch=self.repository.get_kill_switch(),
        )

    async def evaluate_call(
        self, tool_name: str, arguments: dict[str, Any]
    ) -> tuple[bool, str]:
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
            params = msg.get("params") or {}
            tool_name = str(params.get("name", ""))
            arguments = params.get("arguments")
            if not isinstance(arguments, dict):
                arguments = {}

            allowed, reason = await self.evaluate_call(tool_name, arguments)
            if not allowed:
                return False, self._build_blocked_mcp_response(msg.get("id"), reason)

        return True, raw_line

    async def run(self) -> int:
        proc = await asyncio.create_subprocess_exec(
            *self.target_command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=sys.stderr,
        )
        assert proc.stdin is not None and proc.stdout is not None

        async def pump_server_to_client() -> None:
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                sys.stdout.buffer.write(line)
                sys.stdout.buffer.flush()

        async def pump_client_to_server() -> None:
            assert proc.stdin is not None
            loop = asyncio.get_running_loop()
            while True:
                line = await loop.run_in_executor(None, sys.stdin.buffer.readline)
                if not line:
                    break
                should_forward, out_bytes = await self.process_client_line(line)
                if should_forward:
                    proc.stdin.write(out_bytes)
                    await proc.stdin.drain()
                else:
                    sys.stdout.buffer.write(out_bytes)
                    sys.stdout.buffer.flush()
            proc.stdin.close()

        await asyncio.gather(pump_server_to_client(), pump_client_to_server())
        return await proc.wait()


async def run_mcp_proxy(
    target_command: list[str],
    policy_path: str | Path | None = None,
    daemon_url: str | None = "http://127.0.0.1:8080",
    agent_name: str = "mcp-client",
) -> int:
    proxy = MCPStdioProxy(
        target_command=target_command,
        policy_path=policy_path,
        daemon_url=daemon_url,
        agent_name=agent_name,
    )
    return await proxy.run()
