"""AgenVe2 — Open-source AI Agent Execution Firewall."""

from agenve2.core.models import Decision, EvaluationReport, PolicyAction, PolicyMode, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PolicyConfig, PolicyLoader
from agenve2.plugins.base import GuardPlugin, PluginRegistry
from agenve2.sdk.decorator import (
    AgenVe2BlockedError,
    AgenVe2Client,
    VetoBlockedError,
    VetoClient,
    guard,
)

__version__ = "0.1.0"

__all__ = [
    "AgenVe2BlockedError",
    "AgenVe2Client",
    "Decision",
    "EvaluationPipeline",
    "EvaluationReport",
    "GuardPlugin",
    "PluginRegistry",
    "PolicyAction",
    "PolicyConfig",
    "PolicyLoader",
    "PolicyMode",
    "ToolCallRequest",
    "VetoBlockedError",
    "VetoClient",
    "__version__",
    "guard",
]
