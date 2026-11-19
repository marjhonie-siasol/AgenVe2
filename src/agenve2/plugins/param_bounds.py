from __future__ import annotations

import re
from typing import Any

from agenve2.core.models import Decision, FilterResult, ToolCallRequest
from agenve2.plugins.base import GuardPlugin


class ParamBoundsPlugin(GuardPlugin):
    name = "param_bounds"
    description = "Enforces strict numeric min/max, string length/regex, and array size bounds on tool arguments."

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        bounds: dict[str, dict[str, Any]] = options.get("bounds", {})
        if not bounds:
            return FilterResult(
                plugin_name=self.name,
                passed=True,
                decision=Decision.ALLOW,
                reason="No parameter bounds configured.",
            )

        for param_name, spec in bounds.items():
            if param_name not in request.arguments:
                if spec.get("required", False):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Required parameter '{param_name}' is missing.",
                    )
                continue

            val = request.arguments[param_name]

            if "min" in spec or "max" in spec:
                if not isinstance(val, (int, float)) or isinstance(val, bool):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}' must be numeric, got {type(val).__name__}.",
                    )
                if "min" in spec and val < spec["min"]:
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}'={val} is below minimum {spec['min']}.",
                        details={"param": param_name, "value": val, "min": spec["min"]},
                    )
                if "max" in spec and val > spec["max"]:
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}'={val} exceeds maximum {spec['max']}.",
                        details={"param": param_name, "value": val, "max": spec["max"]},
                    )

            if "max_length" in spec and isinstance(val, str):
                if len(val) > int(spec["max_length"]):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}' length {len(val)} exceeds max_length={spec['max_length']}.",
                    )

            if "regex" in spec and isinstance(val, str):
                if not re.fullmatch(spec["regex"], val):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}' failed regex policy '{spec['regex']}'.",
                    )

            if "max_items" in spec and isinstance(val, list):
                if len(val) > int(spec["max_items"]):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Parameter '{param_name}' has {len(val)} items (max_items={spec['max_items']}).",
                    )

        return FilterResult(
            plugin_name=self.name,
            passed=True,
            decision=Decision.ALLOW,
            reason="All parameter bounds satisfied.",
        )
