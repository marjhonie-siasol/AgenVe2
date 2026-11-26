from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

import httpx

from agenve2.core.models import Decision, EvaluationReport, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PolicyLoader
from agenve2.storage.repository import SQLModelAuditRepository

F = TypeVar("F", bound=Callable[..., Any])


class AgenVe2BlockedError(PermissionError):
    """Raised when AgenVe2 blocks or denies a guarded tool execution."""

    def __init__(self, reason: str, report: dict[str, Any] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.report = report or {}


# Backwards compatibility alias
VetoBlockedError = AgenVe2BlockedError


class AgenVe2Client:
    """Python SDK client supporting daemon evaluation with fail-closed local fallback."""

    def __init__(
        self,
        policy: str | Path | None = None,
        daemon_url: str | None = None,
        agent_name: str = "python-agent",
        database_url: str | None = None,
        record_audit: bool = True,
    ) -> None:
        self.daemon_url = daemon_url.rstrip("/") if daemon_url else None
        self.agent_name = agent_name
        self.record_audit = record_audit
        self.policy_loader = PolicyLoader(policy)
        self.repository = SQLModelAuditRepository(database_url) if record_audit else None
        self.pipeline = EvaluationPipeline(
            policy_loader=self.policy_loader,
            kill_switch=self.repository.get_kill_switch() if self.repository else False,
        )

    def _evaluate_local(self, req: ToolCallRequest) -> dict[str, Any]:
        if self.repository:
            self.pipeline.kill_switch = self.repository.get_kill_switch()
        report: EvaluationReport = self.pipeline.evaluate(req)
        if report.effective_decision == Decision.REQUIRE_APPROVAL:
            report.effective_decision = Decision.BLOCK
            report.reason = (
                f"Tool '{req.tool_name}' requires human approval. Connect AgenVe2Client to a "
                "running AgenVe2 daemon (daemon_url='http://127.0.0.1:8080') to approve interactively."
            )
        if self.repository:
            self.repository.record_evaluation(report)
        return report.model_dump(mode="json")

    def evaluate(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        req = ToolCallRequest(
            agent_name=agent_name or self.agent_name,
            tool_name=tool_name,
            arguments=arguments,
        )
        if self.daemon_url:
            timeout_sec = self.policy_loader.config.defaults.approval_timeout_seconds + 15
            try:
                with httpx.Client(timeout=timeout_sec) as client:
                    resp = client.post(
                        f"{self.daemon_url}/api/evaluate",
                        json=req.model_dump(mode="json"),
                    )
                    if resp.status_code == 200:
                        return resp.json()
            except httpx.HTTPError:
                pass

        return self._evaluate_local(req)

    async def async_evaluate(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        req = ToolCallRequest(
            agent_name=agent_name or self.agent_name,
            tool_name=tool_name,
            arguments=arguments,
        )
        if self.daemon_url:
            timeout_sec = self.policy_loader.config.defaults.approval_timeout_seconds + 15
            try:
                async with httpx.AsyncClient(timeout=timeout_sec) as client:
                    resp = await client.post(
                        f"{self.daemon_url}/api/evaluate",
                        json=req.model_dump(mode="json"),
                    )
                    if resp.status_code == 200:
                        return resp.json()
            except httpx.HTTPError:
                pass

        return self._evaluate_local(req)

    def guard(self, tool_name: str | None = None) -> Callable[[F], F]:
        """Decorator wrapping any Python tool function with AgenVe2 enforcement."""

        def decorator(func: F) -> F:
            resolved_tool_name = tool_name or func.__name__
            sig = inspect.signature(func)

            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                bound = sig.bind_partial(*args, **kwargs)
                bound.apply_defaults()
                result = self.evaluate(resolved_tool_name, dict(bound.arguments))
                eff = result.get("effective_decision", Decision.BLOCK.value)
                if eff not in (Decision.ALLOW.value, Decision.APPROVED.value):
                    raise AgenVe2BlockedError(
                        result.get("reason", "Blocked by AgenVe2 policy."), report=result
                    )
                return func(*args, **kwargs)

            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                bound = sig.bind_partial(*args, **kwargs)
                bound.apply_defaults()
                result = await self.async_evaluate(resolved_tool_name, dict(bound.arguments))
                eff = result.get("effective_decision", Decision.BLOCK.value)
                if eff not in (Decision.ALLOW.value, Decision.APPROVED.value):
                    raise AgenVe2BlockedError(
                        result.get("reason", "Blocked by AgenVe2 policy."), report=result
                    )
                return await func(*args, **kwargs)

            if inspect.iscoroutinefunction(func):
                return async_wrapper  # type: ignore[return-value]
            return sync_wrapper  # type: ignore[return-value]

        return decorator


# Backwards compatibility alias
VetoClient = AgenVe2Client


def guard(
    policy: str | Path | None = "policy.yaml",
    *,
    tool_name: str | None = None,
    daemon_url: str | None = None,
    agent_name: str = "python-agent",
    database_url: str | None = None,
    record_audit: bool = True,
) -> Callable[[F], F]:
    """1-line decorator: @guard(policy='./policy.yaml')."""
    client = AgenVe2Client(
        policy=policy,
        daemon_url=daemon_url,
        agent_name=agent_name,
        database_url=database_url,
        record_audit=record_audit,
    )
    return client.guard(tool_name=tool_name)
