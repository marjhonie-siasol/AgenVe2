from __future__ import annotations

import json
from pathlib import Path

import pytest

from veto.core.policy import PRESETS
from veto.proxy.mcp_proxy import MCPStdioProxy
from veto.sdk.decorator import VetoBlockedError, guard


def test_sdk_guard_decorator_sync_and_async(tmp_path: Path):
    policy_file = tmp_path / "policy.yaml"
    policy_file.write_text(PRESETS["strict"], encoding="utf-8")
    db_url = f"sqlite:///{(tmp_path / 'sdk.db').as_posix()}"

    @guard(policy=policy_file, database_url=db_url)
    def postgres_query(query: str) -> str:
        return f"EXECUTED: {query}"

    assert postgres_query("SELECT * FROM users LIMIT 5") == "EXECUTED: SELECT * FROM users LIMIT 5"

    with pytest.raises(VetoBlockedError) as exc_info:
        postgres_query("DROP TABLE users;")
    assert "DROP" in str(exc_info.value)


@pytest.mark.asyncio
async def test_mcp_stdio_proxy_intercepts_tools_call(tmp_path: Path):
    policy_file = tmp_path / "policy.yaml"
    policy_file.write_text(PRESETS["strict"], encoding="utf-8")
    db_url = f"sqlite:///{(tmp_path / 'mcp.db').as_posix()}"

    proxy = MCPStdioProxy(
        target_command=["python", "-c", "pass"],
        policy_path=policy_file,
        daemon_url=None,  # exercise fail-closed local mode
        database_url=db_url,
    )

    # Non-tool RPC passes straight through
    init_line = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode() + b"\n"
    forward, out = await proxy.process_client_line(init_line)
    assert forward is True
    assert out == init_line

    # Safe SELECT passes through
    safe_call = (
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "postgres_query", "arguments": {"query": "SELECT 1"}},
            }
        ).encode()
        + b"\n"
    )
    forward, _ = await proxy.process_client_line(safe_call)
    assert forward is True

    # Dangerous DROP TABLE is blocked without forwarding to target MCP server
    bad_call = (
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "postgres_query", "arguments": {"query": "DROP TABLE orders;"}},
            }
        ).encode()
        + b"\n"
    )
    forward, blocked_resp = await proxy.process_client_line(bad_call)
    assert forward is False
    parsed = json.loads(blocked_resp.decode("utf-8"))
    assert parsed["id"] == 3
    assert parsed["result"]["isError"] is True
    assert "[VETO BLOCKED]" in parsed["result"]["content"][0]["text"]
