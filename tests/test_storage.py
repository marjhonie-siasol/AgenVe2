from __future__ import annotations

from pathlib import Path

from sqlmodel import Session, select

from veto.core.models import ToolCallRequest
from veto.core.pipeline import EvaluationPipeline
from veto.core.policy import PRESETS, PolicyLoader
from veto.storage.repository import AuditLogRow, SQLModelAuditRepository


def test_sqlite_wal_persistence_redaction_and_hash_chain(tmp_path: Path):
    db_file = tmp_path / "audit.db"
    db_url = f"sqlite:///{db_file.as_posix()}"
    policy_file = tmp_path / "policy.yaml"
    policy_file.write_text(PRESETS["strict"], encoding="utf-8")

    repo = SQLModelAuditRepository(db_url)
    pipeline = EvaluationPipeline(PolicyLoader(policy_file))

    r1 = pipeline.evaluate(
        ToolCallRequest(
            agent_name="ollama-agent",
            tool_name="postgres_query",
            arguments={"query": "SELECT * FROM orders LIMIT 5"},
        )
    )
    r2 = pipeline.evaluate(
        ToolCallRequest(
            agent_name="ollama-agent",
            tool_name="slack_post",
            arguments={"text": "Leaked sk-proj-abcdefghijklmnopqrstuvwxyz12345"},
        )
    )
    repo.record_evaluation(r1)
    repo.record_evaluation(r2)
    repo.set_kill_switch(True)

    # Re-open fresh repository instance (simulating laptop restart)
    repo2 = SQLModelAuditRepository(db_url)
    logs = repo2.list_logs(limit=10)
    assert len(logs) == 2
    assert repo2.get_kill_switch() is True

    # Ensure raw secret was redacted BEFORE disk storage
    raw_dump = repo2.export_logs(fmt="json")
    assert "sk-proj-abcdefghijklmnopqrstuvwxyz12345" not in raw_dump
    assert "[REDACTED:openai_api_key]" in raw_dump

    # CSV export works
    csv_out = repo2.export_logs(fmt="csv")
    assert "postgres_query" in csv_out

    # Hash chain verifies cleanly
    valid, count, _ = repo2.verify_chain()
    assert valid is True
    assert count == 2

    # Simulate direct DB tampering and verify detection catches it
    with Session(repo2.engine) as session:
        first = session.exec(select(AuditLogRow).order_by(AuditLogRow.id)).first()
        assert first is not None
        first.reason = "TAMPERED REASON"
        session.add(first)
        session.commit()

    valid_after, _, msg = repo2.verify_chain()
    assert valid_after is False
    assert "Tampering detected" in msg
