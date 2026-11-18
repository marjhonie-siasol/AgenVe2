from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
import pytest

from veto.core.models import Decision
from veto.core.policy import PRESETS
from veto.server.app import VetoRuntime, create_app


@pytest.fixture
def runtime_and_app(tmp_path: Path):
    policy_file = tmp_path / "policy.yaml"
    policy_file.write_text(PRESETS["strict"], encoding="utf-8")
    db_url = f"sqlite:///{(tmp_path / 'audit.db').as_posix()}"
    rt = VetoRuntime(policy_path=policy_file, database_url=db_url)
    app = create_app(runtime=rt, serve_dashboard=False)
    return rt, app


@pytest.mark.asyncio
async def test_api_evaluate_simulate_and_kill_switch(runtime_and_app):
    _, app = runtime_and_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        ok = await client.post(
            "/api/evaluate",
            json={
                "agent_name": "test-agent",
                "tool_name": "postgres_query",
                "arguments": {"query": "SELECT 1"},
            },
        )
        assert ok.status_code == 200
        assert ok.json()["effective_decision"] == Decision.ALLOW.value

        bad = await client.post(
            "/api/simulate",
            json={
                "tool_name": "postgres_query",
                "arguments": {"query": "DROP TABLE orders;"},
            },
        )
        assert bad.status_code == 200
        assert bad.json()["effective_decision"] == Decision.BLOCK.value

        # Engage Kill Switch -> even SELECT 1 gets blocked
        ks = await client.post("/api/state/kill-switch", json={"enabled": True})
        assert ks.status_code == 200
        assert ks.json()["kill_switch"] is True

        blocked = await client.post(
            "/api/evaluate",
            json={
                "agent_name": "test-agent",
                "tool_name": "postgres_query",
                "arguments": {"query": "SELECT 1"},
            },
        )
        assert blocked.json()["effective_decision"] == Decision.BLOCK.value

        # Audit chain stays valid
        verify = await client.get("/api/audit/verify")
        assert verify.json()["valid"] is True


@pytest.mark.asyncio
async def test_async_human_approval_approve_and_deny_with_feedback(runtime_and_app):
    rt, app = runtime_and_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Start approval-gated call in background task
        eval_task = asyncio.create_task(
            client.post(
                "/api/evaluate",
                json={
                    "agent_name": "claude-code",
                    "tool_name": "slack_post",
                    "arguments": {"channel": "#dev-updates", "text": "Hello team"},
                },
            )
        )
        # Wait briefly for pending ticket to appear
        for _ in range(20):
            if rt.approvals.list_pending():
                break
            await asyncio.sleep(0.02)

        pending = rt.approvals.list_pending()
        assert len(pending) == 1
        ticket_id = pending[0]["id"]

        # Operator denies with feedback
        decide = await client.post(
            f"/api/approvals/{ticket_id}/decide",
            json={
                "approved": False,
                "decided_by": "alice",
                "feedback": "Post in #dev-test instead",
            },
        )
        assert decide.status_code == 200

        eval_resp = await eval_task
        body = eval_resp.json()
        assert body["effective_decision"] == Decision.DENIED.value
        assert "Post in #dev-test instead" in body["reason"]
