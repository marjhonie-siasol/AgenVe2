from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agenve2.core.models import (
    ApprovalDecisionRequest,
    ApprovalStatus,
    Decision,
    EvaluationReport,
    PolicyMode,
    ToolCallRequest,
)
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PolicyError, PolicyLoader
from agenve2.plugins import PluginRegistry, create_default_registry
from agenve2.server.approvals import ApprovalManager
from agenve2.storage.repository import SQLModelAuditRepository


class ConnectionHub:
    """Tracks live WebSocket dashboard subscribers."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        payload = json.dumps(message)
        for ws in list(self._connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)


class AgenVe2Runtime:
    """Cohesive runtime combining policy, pipeline, storage, approvals, and WS hub."""

    def __init__(
        self,
        policy_path: str | Path | None = None,
        database_url: str | None = None,
        registry: PluginRegistry | None = None,
        dry_run: bool = False,
        webhook_url: str | None = None,
    ) -> None:
        self.policy_loader = PolicyLoader(policy_path)
        self.repository = SQLModelAuditRepository(database_url)
        self.registry = registry or create_default_registry()
        self.hub = ConnectionHub()

        persisted_kill = self.repository.get_kill_switch()
        persisted_mode = (
            PolicyMode.DRY_RUN
            if dry_run
            else self.repository.get_mode(fallback=self.policy_loader.config.mode)
        )
        if dry_run:
            self.repository.set_mode(PolicyMode.DRY_RUN)

        self.pipeline = EvaluationPipeline(
            policy_loader=self.policy_loader,
            registry=self.registry,
            kill_switch=persisted_kill,
            mode_override=persisted_mode,
        )
        self.approvals = ApprovalManager(
            repository=self.repository,
            on_event=self.hub.broadcast,
            webhook_url=webhook_url,
        )

    async def evaluate_and_record(
        self,
        request: ToolCallRequest,
        *,
        wait_for_approval: bool = True,
    ) -> EvaluationReport:
        report = self.pipeline.evaluate(request)

        if report.decision == Decision.REQUIRE_APPROVAL and wait_for_approval:
            if self.pipeline.active_mode == PolicyMode.DRY_RUN:
                report.effective_decision = Decision.ALLOW
                report.dry_run = True
            else:
                timeout = self.policy_loader.config.defaults.approval_timeout_seconds
                ticket = await self.approvals.request_approval(
                    report, timeout_seconds=timeout
                )
                report.approval_id = ticket.id
                report.feedback = ticket.feedback
                if ticket.status == ApprovalStatus.APPROVED:
                    report.effective_decision = Decision.APPROVED
                    report.reason = f"Approved by {ticket.decided_by or 'operator'}."
                elif ticket.status == ApprovalStatus.TIMEOUT:
                    report.effective_decision = Decision.TIMEOUT
                    report.reason = ticket.feedback or "Approval timed out."
                else:
                    report.effective_decision = Decision.DENIED
                    report.reason = (
                        f"Denied by {ticket.decided_by or 'operator'}"
                        + (f": {ticket.feedback}" if ticket.feedback else ".")
                    )

        row = self.repository.record_evaluation(report)
        await self.hub.broadcast(
            {
                "type": "audit_event",
                "data": self.repository._row_to_dict(row),
            }
        )
        await self.hub.broadcast({"type": "stats_update", "data": self.repository.get_stats()})
        return report


# Backwards compatibility alias
VetoRuntime = AgenVe2Runtime


class PolicyUpdatePayload(BaseModel):
    yaml_content: str


class KillSwitchPayload(BaseModel):
    enabled: bool


class ModePayload(BaseModel):
    mode: PolicyMode


class SimulatePayload(BaseModel):
    agent_name: str = "simulator"
    tool_name: str
    arguments: dict[str, Any] = {}


def create_app(
    runtime: AgenVe2Runtime | None = None,
    serve_dashboard: bool = True,
) -> FastAPI:
    rt = runtime or AgenVe2Runtime()
    app = FastAPI(title="AgenVe2 AI Agent Firewall", version="0.1.0")
    app.state.agenve2 = rt
    app.state.veto = rt  # Backwards compatibility alias

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "kill_switch": rt.pipeline.kill_switch,
            "mode": rt.pipeline.active_mode.value,
        }

    @app.get("/api/state")
    async def get_state() -> dict[str, Any]:
        return {
            "kill_switch": rt.pipeline.kill_switch,
            "mode": rt.pipeline.active_mode.value,
            "policy_path": str(rt.policy_loader.path or "in-memory"),
            "plugins": rt.registry.list_plugins(),
            "stats": rt.repository.get_stats(),
        }

    @app.post("/api/state/kill-switch")
    async def set_kill_switch(payload: KillSwitchPayload) -> dict[str, Any]:
        rt.pipeline.kill_switch = payload.enabled
        rt.repository.set_kill_switch(payload.enabled)
        denied_count = 0
        if payload.enabled:
            denied_count = await rt.approvals.deny_all_pending()
        state = {
            "kill_switch": rt.pipeline.kill_switch,
            "mode": rt.pipeline.active_mode.value,
            "denied_pending": denied_count,
        }
        await rt.hub.broadcast({"type": "state_update", "data": state})
        return state

    @app.post("/api/state/mode")
    async def set_mode(payload: ModePayload) -> dict[str, Any]:
        rt.pipeline.mode_override = payload.mode
        rt.repository.set_mode(payload.mode)
        state = {
            "kill_switch": rt.pipeline.kill_switch,
            "mode": rt.pipeline.active_mode.value,
        }
        await rt.hub.broadcast({"type": "state_update", "data": state})
        return state

    @app.post("/api/evaluate")
    async def evaluate_tool_call(
        request: ToolCallRequest,
        wait: bool = Query(default=True),
    ) -> dict[str, Any]:
        report = await rt.evaluate_and_record(request, wait_for_approval=wait)
        return report.model_dump(mode="json")

    @app.post("/api/simulate")
    async def simulate_tool_call(payload: SimulatePayload) -> dict[str, Any]:
        req = ToolCallRequest(
            agent_name=payload.agent_name,
            tool_name=payload.tool_name,
            arguments=payload.arguments,
        )
        report = rt.pipeline.evaluate(req, skip_rate_limit=True)
        return report.model_dump(mode="json")

    @app.get("/api/logs")
    async def list_logs(
        limit: int = Query(default=100, ge=1, le=1000),
        decision: str | None = None,
        tool_name: str | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        return {
            "logs": rt.repository.list_logs(
                limit=limit, decision=decision, tool_name=tool_name, search=search
            ),
            "stats": rt.repository.get_stats(),
        }

    @app.get("/api/logs/export")
    async def export_logs(fmt: str = Query(default="json")) -> PlainTextResponse:
        content = rt.repository.export_logs(fmt=fmt)
        media = "text/csv" if fmt.lower() == "csv" else "application/json"
        filename = f"agenve2-audit.{fmt.lower()}"
        return PlainTextResponse(
            content=content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.get("/api/audit/verify")
    async def verify_audit() -> dict[str, Any]:
        ok, count, message = rt.repository.verify_chain()
        return {"valid": ok, "entries": count, "message": message}

    @app.get("/api/stats")
    async def get_stats() -> dict[str, Any]:
        return rt.repository.get_stats()

    @app.get("/api/approvals")
    async def list_approvals(status: str | None = None) -> dict[str, Any]:
        return {
            "pending": rt.approvals.list_pending(),
            "history": rt.repository.list_approvals(status=status, limit=50),
        }

    @app.post("/api/approvals/{ticket_id}/decide")
    async def decide_approval(
        ticket_id: str, payload: ApprovalDecisionRequest
    ) -> dict[str, Any]:
        ticket = await rt.approvals.decide(
            ticket_id=ticket_id,
            approved=payload.approved,
            decided_by=payload.decided_by,
            feedback=payload.feedback,
        )
        if not ticket:
            raise HTTPException(
                status_code=404, detail=f"Pending approval '{ticket_id}' not found."
            )
        return ticket.model_dump(mode="json")

    @app.get("/api/policy")
    async def get_policy() -> dict[str, Any]:
        rt.policy_loader.reload_if_changed()
        return {
            "path": str(rt.policy_loader.path or "in-memory"),
            "yaml_content": rt.policy_loader.raw_yaml,
            "parsed": rt.policy_loader.config.model_dump(mode="json"),
        }

    @app.put("/api/policy")
    async def update_policy(payload: PolicyUpdatePayload) -> dict[str, Any]:
        try:
            config = rt.policy_loader.update_from_yaml(
                payload.yaml_content, persist=bool(rt.policy_loader.path)
            )
        except PolicyError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await rt.hub.broadcast(
            {"type": "policy_updated", "data": config.model_dump(mode="json")}
        )
        return {
            "ok": True,
            "parsed": config.model_dump(mode="json"),
        }

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        await rt.hub.connect(ws)
        try:
            await ws.send_text(
                json.dumps(
                    {
                        "type": "init",
                        "data": {
                            "kill_switch": rt.pipeline.kill_switch,
                            "mode": rt.pipeline.active_mode.value,
                            "stats": rt.repository.get_stats(),
                            "pending": rt.approvals.list_pending(),
                        },
                    }
                )
            )
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            rt.hub.disconnect(ws)
        except Exception:
            rt.hub.disconnect(ws)

    if serve_dashboard:
        dist_dir = Path(__file__).resolve().parent.parent / "dashboard_dist"
        if dist_dir.exists() and (dist_dir / "index.html").exists():
            app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="dashboard")

    return app
