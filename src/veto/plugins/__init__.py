from veto.plugins.base import GuardPlugin, PluginRegistry
from veto.plugins.filesystem_guard import FilesystemGuardPlugin
from veto.plugins.param_bounds import ParamBoundsPlugin
from veto.plugins.rate_limiter import RateLimiterPlugin
from veto.plugins.secret_scanner import SecretScannerPlugin, redact_text, redact_value
from veto.plugins.shell_guard import ShellGuardPlugin
from veto.plugins.sql_guard import SQLGuardPlugin


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
