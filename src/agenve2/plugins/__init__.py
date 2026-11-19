from agenve2.plugins.base import GuardPlugin, PluginRegistry
from agenve2.plugins.filesystem_guard import FilesystemGuardPlugin
from agenve2.plugins.param_bounds import ParamBoundsPlugin
from agenve2.plugins.rate_limiter import RateLimiterPlugin
from agenve2.plugins.secret_scanner import SecretScannerPlugin, redact_text, redact_value
from agenve2.plugins.shell_guard import ShellGuardPlugin
from agenve2.plugins.sql_guard import SQLGuardPlugin


def create_default_registry() -> PluginRegistry:
    registry = PluginRegistry()
    registry.register(SQLGuardPlugin())
    registry.register(ShellGuardPlugin())
    registry.register(FilesystemGuardPlugin())
    registry.register(SecretScannerPlugin())
    registry.register(ParamBoundsPlugin())
    registry.register(RateLimiterPlugin())
    return registry


__all__ = [
    "FilesystemGuardPlugin",
    "GuardPlugin",
    "ParamBoundsPlugin",
    "PluginRegistry",
    "RateLimiterPlugin",
    "SQLGuardPlugin",
    "SecretScannerPlugin",
    "ShellGuardPlugin",
    "create_default_registry",
    "redact_text",
    "redact_value",
]
