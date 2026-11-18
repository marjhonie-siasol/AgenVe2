from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from veto.core.models import FilterResult, ToolCallRequest


class GuardPlugin(ABC):
    """Microkernel plug-in interface for deterministic or ML security guards."""

    name: str = "base"
    description: str = ""

    @abstractmethod
    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        """Evaluate a tool call and return a FilterResult."""


class PluginRegistry:
    """Central registry allowing built-in and custom third-party plug-ins."""

    def __init__(self) -> None:
        self._plugins: dict[str, GuardPlugin] = {}

    def register(self, plugin: GuardPlugin) -> None:
        self._plugins[plugin.name] = plugin

    def get(self, name: str) -> GuardPlugin | None:
        return self._plugins.get(name)

    def list_plugins(self) -> list[dict[str, str]]:
        return [
            {"name": p.name, "description": p.description}
            for p in self._plugins.values()
        ]

    def names(self) -> list[str]:
        return sorted(self._plugins.keys())
