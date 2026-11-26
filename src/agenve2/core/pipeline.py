from __future__ import annotations

import fnmatch
import time
from typing import Any

from agenve2.core.models import (
    Decision,
    EvaluationReport,
    FilterResult,
    PolicyAction,
    PolicyMode,
    ToolCallRequest,
)
from agenve2.core.policy import PluginConfig, PolicyConfig, PolicyLoader, RuleConfig
from agenve2.plugins import PluginRegistry, create_default_registry, redact_value


def _resolve_rule(
    rules: dict[str, RuleConfig], tool_name: str
) -> tuple[str, RuleConfig | None]:
    """Resolve an exact rule first, then the most specific matching glob pattern."""
    if tool_name in rules:
        return tool_name, rules[tool_name]

    matches: list[tuple[tuple[int, int], str, RuleConfig]] = []
    for pattern, rule in rules.items():
        if any(ch in pattern for ch in ("*", "?", "[")) and fnmatch.fnmatchcase(tool_name, pattern):
            literal_chars = sum(1 for ch in pattern if ch not in ("*", "?", "["))
            matches.append(((literal_chars, len(pattern)), pattern, rule))

    if not matches:
        return tool_name, None

    matches.sort(key=lambda item: item[0], reverse=True)
    _, matched_pattern, matched_rule = matches[0]
    return matched_pattern, matched_rule


class EvaluationPipeline:
    """Pipes-and-Filters fail-closed evaluation engine for AI agent tool calls."""

    def __init__(
        self,
        policy_loader: PolicyLoader,
        registry: PluginRegistry | None = None,
        kill_switch: bool = False,
        mode_override: PolicyMode | None = None,
    ) -> None:
        self.policy_loader = policy_loader
        self.registry = registry or create_default_registry()
        self.kill_switch = kill_switch
        self.mode_override = mode_override

    @property
    def active_mode(self) -> PolicyMode:
        return self.mode_override or self.policy_loader.config.mode

    def _finalize(
        self,
        request: ToolCallRequest,
        decision: Decision,
        reason: str,
        rule_triggered: str,
        plugin_triggered: str | None,
        filters: list[FilterResult],
        start_ns: int,
        redacted_args: dict[str, Any],
        respect_dry_run: bool = True,
    ) -> EvaluationReport:
        latency_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000, 3)
        is_dry_run = respect_dry_run and (self.active_mode == PolicyMode.DRY_RUN)
        effective = Decision.ALLOW if (is_dry_run and decision == Decision.BLOCK) else decision
        return EvaluationReport(
            request_id=request.request_id,
            agent_name=request.agent_name,
            tool_name=request.tool_name,
            decision=decision,
            effective_decision=effective,
            dry_run=is_dry_run,
            reason=reason,
            rule_triggered=rule_triggered,
            plugin_triggered=plugin_triggered,
            latency_ms=latency_ms,
            filters=filters,
            redacted_arguments=redacted_args,
        )

    def _run_plugin(
        self,
        plugin_cfg: PluginConfig,
        request: ToolCallRequest,
        policy: PolicyConfig,
    ) -> FilterResult:
        if not plugin_cfg.enabled:
            return FilterResult(
                plugin_name=plugin_cfg.name,
                passed=True,
                decision=Decision.ALLOW,
                reason="Plug-in disabled.",
            )

        plugin = self.registry.get(plugin_cfg.name)
        if plugin is None:
            # Fail-closed when a configured security plug-in is missing
            return FilterResult(
                plugin_name=plugin_cfg.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"Fail-closed: unknown security plug-in '{plugin_cfg.name}'.",
            )

        options = plugin_cfg.plugin_options()
        if plugin_cfg.name == "rate_limiter" and "max_calls_per_minute" not in options:
            options["max_calls_per_minute"] = policy.rate_limit.max_calls_per_minute
        if (
            plugin_cfg.name == "filesystem_guard"
            and "base_dir" not in options
            and self.policy_loader.path
        ):
            options["base_dir"] = str(self.policy_loader.path.parent.resolve())

        try:
            return plugin.evaluate(request, options)
        except Exception as exc:  # noqa: BLE001
            # Fail-closed on any unexpected plug-in crash
            return FilterResult(
                plugin_name=plugin_cfg.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"Fail-closed plug-in error in '{plugin_cfg.name}': {exc}",
            )

    def evaluate(
        self,
        request: ToolCallRequest,
        *,
        skip_rate_limit: bool = False,
    ) -> EvaluationReport:
        start_ns = time.perf_counter_ns()
        self.policy_loader.reload_if_changed()
        policy = self.policy_loader.config
        redacted_args = redact_value(request.arguments)
        filters: list[FilterResult] = []

        # Stage 0: Global Kill Switch (NEVER bypassed by dry-run!)
        if self.kill_switch:
            res = FilterResult(
                plugin_name="kill_switch",
                passed=False,
                decision=Decision.BLOCK,
                reason="Global Kill Switch is engaged. All agent executions are frozen.",
            )
            filters.append(res)
            return self._finalize(
                request=request,
                decision=Decision.BLOCK,
                reason=res.reason,
                rule_triggered="global_kill_switch",
                plugin_triggered="kill_switch",
                filters=filters,
                start_ns=start_ns,
                redacted_args=redacted_args,
                respect_dry_run=False,
            )

        # Stage 1: Global Plug-ins (secret_scanner, rate_limiter, etc.)
        for plugin_cfg in policy.global_plugins:
            if skip_rate_limit and plugin_cfg.name == "rate_limiter":
                continue
            res = self._run_plugin(plugin_cfg, request, policy)
            filters.append(res)
            if not res.passed:
                return self._finalize(
                    request=request,
                    decision=Decision.BLOCK,
                    reason=res.reason,
                    rule_triggered=f"global:{plugin_cfg.name}",
                    plugin_triggered=plugin_cfg.name,
                    filters=filters,
                    start_ns=start_ns,
                    redacted_args=redacted_args,
                )

        # Stage 2: Tool Policy Resolution (Exact match -> glob pattern -> fail-closed default)
        matched_rule_key, rule = _resolve_rule(policy.rules, request.tool_name)
        if rule is None:
            default_action = policy.defaults.action
            if default_action == PolicyAction.DENY:
                return self._finalize(
                    request=request,
                    decision=Decision.BLOCK,
                    reason=f"Tool '{request.tool_name}' is not listed in policy.yaml (fail-closed default: deny).",
                    rule_triggered="defaults.action=deny",
                    plugin_triggered=None,
                    filters=filters,
                    start_ns=start_ns,
                    redacted_args=redacted_args,
                )
            if default_action == PolicyAction.REQUIRE_APPROVAL:
                return self._finalize(
                    request=request,
                    decision=Decision.REQUIRE_APPROVAL,
                    reason=f"Tool '{request.tool_name}' requires approval (default policy).",
                    rule_triggered="defaults.action=require_approval",
                    plugin_triggered=None,
                    filters=filters,
                    start_ns=start_ns,
                    redacted_args=redacted_args,
                )
            return self._finalize(
                request=request,
                decision=Decision.ALLOW,
                reason=f"Tool '{request.tool_name}' allowed by default policy.",
                rule_triggered="defaults.action=allow",
                plugin_triggered=None,
                filters=filters,
                start_ns=start_ns,
                redacted_args=redacted_args,
            )

        # Stage 3: Explicit DENY rule short-circuits immediately
        if rule.action == PolicyAction.DENY:
            return self._finalize(
                request=request,
                decision=Decision.BLOCK,
                reason=rule.message or f"Tool '{request.tool_name}' is explicitly denied by policy.",
                rule_triggered=f"rules.{matched_rule_key}:deny",
                plugin_triggered=None,
                filters=filters,
                start_ns=start_ns,
                redacted_args=redacted_args,
            )

        # Stage 4: Tool-Specific Domain Plug-ins (sql_guard, shell_guard, filesystem_guard, param_bounds)
        for plugin_cfg in rule.plugins:
            res = self._run_plugin(plugin_cfg, request, policy)
            filters.append(res)
            if not res.passed:
                return self._finalize(
                    request=request,
                    decision=Decision.BLOCK,
                    reason=res.reason,
                    rule_triggered=f"rules.{matched_rule_key}:{plugin_cfg.name}",
                    plugin_triggered=plugin_cfg.name,
                    filters=filters,
                    start_ns=start_ns,
                    redacted_args=redacted_args,
                )

        # Stage 5: Final Decision Gate (ALLOW vs REQUIRE_APPROVAL)
        if rule.action == PolicyAction.REQUIRE_APPROVAL:
            return self._finalize(
                request=request,
                decision=Decision.REQUIRE_APPROVAL,
                reason=rule.message or f"Tool '{request.tool_name}' requires operator approval.",
                rule_triggered=f"rules.{matched_rule_key}:require_approval",
                plugin_triggered=None,
                filters=filters,
                start_ns=start_ns,
                redacted_args=redacted_args,
            )

        return self._finalize(
            request=request,
            decision=Decision.ALLOW,
            reason=f"Tool '{request.tool_name}' passed all policy & plug-in checks.",
            rule_triggered=f"rules.{matched_rule_key}:allow",
            plugin_triggered=None,
            filters=filters,
            start_ns=start_ns,
            redacted_args=redacted_args,
        )
