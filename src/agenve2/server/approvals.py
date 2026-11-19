from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from agenve2.core.models import (
    ApprovalStatus,
    ApprovalTicket,
    EvaluationReport,
    utc_now,
)
from agenve2.storage.repository import AuditRepository

EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


class ApprovalManager:
    """Manages asyncio pause/resume human-in-the-loop approval tickets."""

    def __init__(
        self,
        repository: AuditRepository,
        on_event: EventCallback | None = None,
        webhook_url: str | None = None,
    ) -> None:
        self.repository = repository
        self.on_event = on_event
        self.webhook_url = (
            webhook_url or os.getenv("AGENVE2_WEBHOOK_URL") or os.getenv("VETO_WEBHOOK_URL")
        )
        self._pending: dict[str, tuple[ApprovalTicket, asyncio.Event]] = {}

    def list_pending(self) -> list[dict[str, Any]]:
        return [
            {
                "id": ticket.id,
                "request_id": ticket.request_id,
                "agent_name": ticket.agent_name,
                "tool_name": ticket.tool_name,
                "arguments": ticket.redacted_arguments,
                "rule_triggered": ticket.rule_triggered,
                "message": ticket.message,
                "status": ticket.status.value,
                "timeout_seconds": ticket.timeout_seconds,
                "created_at": ticket.created_at.isoformat(),
            }
            for ticket, _ in self._pending.values()
        ]

    async def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        if self.on_event:
            try:
                await self.on_event({"type": event_type, "data": payload})
            except Exception:
                pass

    async def _send_webhook(self, ticket: ApprovalTicket) -> None:
        if not self.webhook_url:
            return
        preview = json.dumps(ticket.redacted_arguments, indent=2)[:800]
        text = (
            f"*AgenVe2 Approval Needed* (`{ticket.id}`)\n"
            f"*Agent:* `{ticket.agent_name}` | *Tool:* `{ticket.tool_name}`\n"
            f"*Rule:* `{ticket.rule_triggered}`\n"
            f"```{preview}```"
        )
        # Compatible with both Slack ("text") and Discord ("content")
        body = {"text": text, "content": text}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(self.webhook_url, json=body)
        except Exception:
            pass

    async def request_approval(
        self,
        report: EvaluationReport,
        timeout_seconds: int = 120,
    ) -> ApprovalTicket:
        ticket = ApprovalTicket(
            request_id=report.request_id,
            agent_name=report.agent_name,
            tool_name=report.tool_name,
            redacted_arguments=report.redacted_arguments,
            rule_triggered=report.rule_triggered,
            message=report.reason,
            timeout_seconds=timeout_seconds,
        )
        event = asyncio.Event()
        self._pending[ticket.id] = (ticket, event)
        self.repository.save_approval(ticket)

        await self._emit(
            "approval_created",
            {
                "id": ticket.id,
                "request_id": ticket.request_id,
                "agent_name": ticket.agent_name,
                "tool_name": ticket.tool_name,
                "arguments": ticket.redacted_arguments,
                "rule_triggered": ticket.rule_triggered,
                "message": ticket.message,
                "status": ticket.status.value,
                "timeout_seconds": ticket.timeout_seconds,
                "created_at": ticket.created_at.isoformat(),
            },
        )
        asyncio.create_task(self._send_webhook(ticket))

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout_seconds)
        except TimeoutError:
            ticket.status = ApprovalStatus.TIMEOUT
            ticket.decided_at = utc_now()
            ticket.decided_by = "system:timeout"
            ticket.feedback = f"Approval timed out after {timeout_seconds}s (fail-closed deny)."
            self.repository.save_approval(ticket)
            await self._emit(
                "approval_resolved",
                {
                    "id": ticket.id,
                    "status": ticket.status.value,
                    "feedback": ticket.feedback,
                },
            )
        finally:
            self._pending.pop(ticket.id, None)

        return ticket

    async def decide(
        self,
        ticket_id: str,
        approved: bool,
        decided_by: str = "operator",
        feedback: str | None = None,
    ) -> ApprovalTicket | None:
        entry = self._pending.get(ticket_id)
        if not entry:
            return None
        ticket, event = entry
        ticket.status = ApprovalStatus.APPROVED if approved else ApprovalStatus.DENIED
        ticket.decided_at = utc_now()
        ticket.decided_by = decided_by
        ticket.feedback = feedback
        self.repository.save_approval(ticket)
        event.set()
        await self._emit(
            "approval_resolved",
            {
                "id": ticket.id,
                "status": ticket.status.value,
                "decided_by": decided_by,
                "feedback": feedback,
            },
        )
        return ticket

    async def deny_all_pending(self, reason: str = "Global Kill Switch engaged.") -> int:
        ids = list(self._pending.keys())
        for ticket_id in ids:
            await self.decide(ticket_id, approved=False, decided_by="kill_switch", feedback=reason)
        return len(ids)
