from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from abc import ABC, abstractmethod
from datetime import UTC, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import event
from sqlmodel import Field, Session, SQLModel, create_engine, desc, select

from veto.core.models import (
    ApprovalStatus,
    ApprovalTicket,
    Decision,
    EvaluationReport,
    PolicyMode,
    utc_now,
)


def default_db_url(db_path: str | Path | None = None) -> str:
    env_url = os.getenv("DATABASE_URL")
    if env_url and db_path is None:
        return env_url
    env_path = os.getenv("VETO_DB_PATH")
    target = Path(db_path or env_path or (Path.home() / ".veto" / "audit.db"))
    target.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{target.resolve().as_posix()}"


class AuditLogRow(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: int | None = Field(default=None, primary_key=True)
    request_id: str = Field(index=True)
    timestamp: str = Field(index=True)
    agent_name: str = Field(index=True)
    tool_name: str = Field(index=True)
    arguments_json: str
    decision: str = Field(index=True)
    effective_decision: str = Field(index=True)
    dry_run: bool = Field(default=False)
    reason: str
    rule_triggered: str
    plugin_triggered: str | None = Field(default=None)
    latency_ms: float = Field(default=0.0)
    feedback: str | None = Field(default=None)
    prev_hash: str
    entry_hash: str = Field(index=True)


class ApprovalRow(SQLModel, table=True):
    __tablename__ = "approvals"

    id: str = Field(primary_key=True)
    request_id: str = Field(index=True)
    agent_name: str
    tool_name: str
    arguments_json: str
    rule_triggered: str
    message: str = Field(default="")
    status: str = Field(index=True, default=ApprovalStatus.PENDING.value)
    timeout_seconds: int = Field(default=120)
    created_at: str
    decided_at: str | None = Field(default=None)
    decided_by: str | None = Field(default=None)
    feedback: str | None = Field(default=None)


class SystemStateRow(SQLModel, table=True):
    __tablename__ = "system_state"

    key: str = Field(primary_key=True)
    value: str
    updated_at: str


def _compute_entry_hash(prev_hash: str, payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    raw = f"{prev_hash}|{canonical}".encode()
    return hashlib.sha256(raw).hexdigest()


class AuditRepository(ABC):
    """Hexagonal storage port for persistent audit logs, approvals, and state."""

    @abstractmethod
    def record_evaluation(self, report: EvaluationReport) -> AuditLogRow: ...

    @abstractmethod
    def list_logs(
        self,
        limit: int = 100,
        decision: str | None = None,
        tool_name: str | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    def get_stats(self) -> dict[str, Any]: ...

    @abstractmethod
    def verify_chain(self) -> tuple[bool, int, str]: ...

    @abstractmethod
    def save_approval(self, ticket: ApprovalTicket) -> None: ...

    @abstractmethod
    def list_approvals(self, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]: ...

    @abstractmethod
    def get_state(self, key: str, default: str = "") -> str: ...

    @abstractmethod
    def set_state(self, key: str, value: str) -> None: ...

    @abstractmethod
    def export_logs(self, fmt: str = "json") -> str: ...

    @abstractmethod
    def cleanup_old_logs(self, retention_days: int) -> int: ...


class SQLModelAuditRepository(AuditRepository):
    """SQLite (WAL mode) and PostgreSQL compatible repository via SQLModel."""

    GENESIS_HASH = "0" * 64

    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or default_db_url()
        connect_args = (
            {"check_same_thread": False}
            if self.database_url.startswith("sqlite")
            else {}
        )
        self.engine = create_engine(self.database_url, connect_args=connect_args)

        if self.database_url.startswith("sqlite"):
            @event.listens_for(self.engine, "connect")
            def _set_sqlite_pragma(dbapi_connection: Any, _: Any) -> None:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL;")
                cursor.execute("PRAGMA synchronous=NORMAL;")
                cursor.close()

        SQLModel.metadata.create_all(self.engine)

    def _row_to_dict(self, row: AuditLogRow) -> dict[str, Any]:
        return {
            "id": row.id,
            "request_id": row.request_id,
            "timestamp": row.timestamp,
            "agent_name": row.agent_name,
            "tool_name": row.tool_name,
            "arguments": json.loads(row.arguments_json),
            "decision": row.decision,
            "effective_decision": row.effective_decision,
            "dry_run": row.dry_run,
            "reason": row.reason,
            "rule_triggered": row.rule_triggered,
            "plugin_triggered": row.plugin_triggered,
            "latency_ms": row.latency_ms,
            "feedback": row.feedback,
            "prev_hash": row.prev_hash,
            "entry_hash": row.entry_hash,
        }

    def record_evaluation(self, report: EvaluationReport) -> AuditLogRow:
        ts = report.timestamp.astimezone(UTC).isoformat()
        args_json = json.dumps(report.redacted_arguments, sort_keys=True)

        with Session(self.engine) as session:
            last_row = session.exec(
                select(AuditLogRow).order_by(desc(AuditLogRow.id)).limit(1)
            ).first()
            prev_hash = last_row.entry_hash if last_row else self.GENESIS_HASH

            hash_payload = {
                "request_id": report.request_id,
                "timestamp": ts,
                "agent_name": report.agent_name,
                "tool_name": report.tool_name,
                "arguments_json": args_json,
                "decision": report.decision.value,
                "effective_decision": report.effective_decision.value,
                "dry_run": report.dry_run,
                "reason": report.reason,
                "rule_triggered": report.rule_triggered,
                "plugin_triggered": report.plugin_triggered,
                "feedback": report.feedback,
            }
            entry_hash = _compute_entry_hash(prev_hash, hash_payload)

            row = AuditLogRow(
                request_id=report.request_id,
                timestamp=ts,
                agent_name=report.agent_name,
                tool_name=report.tool_name,
                arguments_json=args_json,
                decision=report.decision.value,
                effective_decision=report.effective_decision.value,
                dry_run=report.dry_run,
                reason=report.reason,
                rule_triggered=report.rule_triggered,
                plugin_triggered=report.plugin_triggered,
                latency_ms=report.latency_ms,
                feedback=report.feedback,
                prev_hash=prev_hash,
                entry_hash=entry_hash,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return row

    def list_logs(
        self,
        limit: int = 100,
        decision: str | None = None,
        tool_name: str | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        with Session(self.engine) as session:
            stmt = select(AuditLogRow).order_by(desc(AuditLogRow.id))
            if decision:
                stmt = stmt.where(AuditLogRow.effective_decision == decision.upper())
            if tool_name:
                stmt = stmt.where(AuditLogRow.tool_name == tool_name)
            rows = session.exec(stmt.limit(max(limit * 2, 200))).all()

        results = [self._row_to_dict(r) for r in rows]
        if search:
            q = search.lower()
            results = [
                r
                for r in results
                if q in r["tool_name"].lower()
                or q in r["agent_name"].lower()
                or q in r["reason"].lower()
                or q in json.dumps(r["arguments"]).lower()
            ]
        return results[:limit]

    def get_stats(self) -> dict[str, Any]:
        with Session(self.engine) as session:
            rows = session.exec(select(AuditLogRow)).all()
            pending_count = len(
                session.exec(
                    select(ApprovalRow).where(
                        ApprovalRow.status == ApprovalStatus.PENDING.value
                    )
                ).all()
            )

        total = len(rows)
        allowed = sum(
            1
            for r in rows
            if r.effective_decision in (Decision.ALLOW.value, Decision.APPROVED.value)
        )
        blocked = sum(
            1
            for r in rows
            if r.effective_decision
            in (Decision.BLOCK.value, Decision.DENIED.value, Decision.TIMEOUT.value)
        )
        avg_latency = round(sum(r.latency_ms for r in rows) / total, 2) if total else 0.0
        return {
            "total": total,
            "allowed": allowed,
            "blocked": blocked,
            "pending": pending_count,
            "avg_latency_ms": avg_latency,
        }

    def verify_chain(self) -> tuple[bool, int, str]:
        with Session(self.engine) as session:
            rows = session.exec(select(AuditLogRow).order_by(AuditLogRow.id)).all()

        expected_prev = self.GENESIS_HASH
        for row in rows:
            if row.prev_hash != expected_prev:
                return (
                    False,
                    len(rows),
                    f"Chain broken at row id={row.id}: prev_hash mismatch.",
                )
            payload = {
                "request_id": row.request_id,
                "timestamp": row.timestamp,
                "agent_name": row.agent_name,
                "tool_name": row.tool_name,
                "arguments_json": row.arguments_json,
                "decision": row.decision,
                "effective_decision": row.effective_decision,
                "dry_run": row.dry_run,
                "reason": row.reason,
                "rule_triggered": row.rule_triggered,
                "plugin_triggered": row.plugin_triggered,
                "feedback": row.feedback,
            }
            recomputed = _compute_entry_hash(row.prev_hash, payload)
            if recomputed != row.entry_hash:
                return (
                    False,
                    len(rows),
                    f"Tampering detected at row id={row.id}: hash mismatch.",
                )
            expected_prev = row.entry_hash

        return (True, len(rows), f"Verified {len(rows)} audit entries; chain intact.")

    def save_approval(self, ticket: ApprovalTicket) -> None:
        with Session(self.engine) as session:
            existing = session.get(ApprovalRow, ticket.id)
            args_json = json.dumps(ticket.redacted_arguments, sort_keys=True)
            created_str = ticket.created_at.astimezone(UTC).isoformat()
            decided_str = (
                ticket.decided_at.astimezone(UTC).isoformat()
                if ticket.decided_at
                else None
            )
            if existing:
                existing.status = ticket.status.value
                existing.decided_at = decided_str
                existing.decided_by = ticket.decided_by
                existing.feedback = ticket.feedback
                session.add(existing)
            else:
                row = ApprovalRow(
                    id=ticket.id,
                    request_id=ticket.request_id,
                    agent_name=ticket.agent_name,
                    tool_name=ticket.tool_name,
                    arguments_json=args_json,
                    rule_triggered=ticket.rule_triggered,
                    message=ticket.message,
                    status=ticket.status.value,
                    timeout_seconds=ticket.timeout_seconds,
                    created_at=created_str,
                    decided_at=decided_str,
                    decided_by=ticket.decided_by,
                    feedback=ticket.feedback,
                )
                session.add(row)
            session.commit()

    def list_approvals(
        self, status: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        with Session(self.engine) as session:
            stmt = select(ApprovalRow).order_by(desc(ApprovalRow.created_at))
            if status:
                stmt = stmt.where(ApprovalRow.status == status)
            rows = session.exec(stmt.limit(limit)).all()
        return [
            {
                "id": r.id,
                "request_id": r.request_id,
                "agent_name": r.agent_name,
                "tool_name": r.tool_name,
                "arguments": json.loads(r.arguments_json),
                "rule_triggered": r.rule_triggered,
                "message": r.message,
                "status": r.status,
                "timeout_seconds": r.timeout_seconds,
                "created_at": r.created_at,
                "decided_at": r.decided_at,
                "decided_by": r.decided_by,
                "feedback": r.feedback,
            }
            for r in rows
        ]

    def get_state(self, key: str, default: str = "") -> str:
        with Session(self.engine) as session:
            row = session.get(SystemStateRow, key)
            return row.value if row else default

    def set_state(self, key: str, value: str) -> None:
        now_str = utc_now().isoformat()
        with Session(self.engine) as session:
            existing = session.get(SystemStateRow, key)
            if existing:
                existing.value = value
                existing.updated_at = now_str
                session.add(existing)
            else:
                session.add(SystemStateRow(key=key, value=value, updated_at=now_str))
            session.commit()

    def get_kill_switch(self) -> bool:
        return self.get_state("kill_switch", "false").lower() == "true"

    def set_kill_switch(self, enabled: bool) -> None:
        self.set_state("kill_switch", "true" if enabled else "false")

    def get_mode(self, fallback: PolicyMode = PolicyMode.ENFORCE) -> PolicyMode:
        raw = self.get_state("mode", "")
        if raw in (PolicyMode.ENFORCE.value, PolicyMode.DRY_RUN.value):
            return PolicyMode(raw)
        return fallback

    def set_mode(self, mode: PolicyMode) -> None:
        self.set_state("mode", mode.value)

    def export_logs(self, fmt: str = "json") -> str:
        logs = self.list_logs(limit=10_000)
        if fmt.lower() == "csv":
            buf = io.StringIO()
            fieldnames = [
                "id",
                "timestamp",
                "agent_name",
                "tool_name",
                "decision",
                "effective_decision",
                "dry_run",
                "rule_triggered",
                "plugin_triggered",
                "latency_ms",
                "reason",
                "arguments",
            ]
            writer = csv.DictWriter(buf, fieldnames=fieldnames)
            writer.writeheader()
            for item in logs:
                row = {k: item.get(k) for k in fieldnames}
                row["arguments"] = json.dumps(item.get("arguments", {}))
                writer.writerow(row)
            return buf.getvalue()
        return json.dumps(logs, indent=2)

    def cleanup_old_logs(self, retention_days: int) -> int:
        cutoff = (utc_now() - timedelta(days=retention_days)).isoformat()
        with Session(self.engine) as session:
            rows = session.exec(
                select(AuditLogRow).where(AuditLogRow.timestamp < cutoff)
            ).all()
            count = len(rows)
            for r in rows:
                session.delete(r)
            session.commit()
        return count
