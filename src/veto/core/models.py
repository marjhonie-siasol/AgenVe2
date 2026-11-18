from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(UTC)


class PolicyMode(str, Enum):
    ENFORCE = "enforce"
    DRY_RUN = "dry_run"


class PolicyAction(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


class Decision(str, Enum):
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    TIMEOUT = "TIMEOUT"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    TIMEOUT = "timeout"


class ToolCallRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: uuid4().hex[:12])
    agent_name: str = Field(default="unknown-agent")
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=utc_now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FilterResult(BaseModel):
    plugin_name: str
    passed: bool
    decision: Decision = Decision.ALLOW
    reason: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class EvaluationReport(BaseModel):
    request_id: str
    agent_name: str
    tool_name: str
    decision: Decision
    effective_decision: Decision
    dry_run: bool = False
    reason: str
    rule_triggered: str
    plugin_triggered: str | None = None
    latency_ms: float = 0.0
    filters: list[FilterResult] = Field(default_factory=list)
    redacted_arguments: dict[str, Any] = Field(default_factory=dict)
    feedback: str | None = None
    approval_id: str | None = None
    timestamp: datetime = Field(default_factory=utc_now)


class ApprovalTicket(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    request_id: str
    agent_name: str
    tool_name: str
    redacted_arguments: dict[str, Any] = Field(default_factory=dict)
    rule_triggered: str
    message: str = ""
    status: ApprovalStatus = ApprovalStatus.PENDING
    timeout_seconds: int = 120
    created_at: datetime = Field(default_factory=utc_now)
    decided_at: datetime | None = None
    decided_by: str | None = None
    feedback: str | None = None


class ApprovalDecisionRequest(BaseModel):
    approved: bool
    decided_by: str = "operator"
    feedback: str | None = None


class SystemStateSnapshot(BaseModel):
    kill_switch: bool = False
    mode: PolicyMode = PolicyMode.ENFORCE
    policy_path: str = "policy.yaml"
    active_plugins: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=utc_now)
