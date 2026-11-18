"""Veto — Open-source AI Agent Execution Firewall."""

from veto.core.models import Decision, EvaluationReport, PolicyAction, PolicyMode, ToolCallRequest
from veto.core.pipeline import EvaluationPipeline
from veto.core.policy import PolicyConfig, PolicyLoader
from veto.plugins.base import GuardPlugin, PluginRegistry
from veto.sdk.decorator import VetoBlockedError, VetoClient, guard

__version__ = "0.1.0"

__all__ = [
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
