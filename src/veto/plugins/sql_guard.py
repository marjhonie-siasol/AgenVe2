from __future__ import annotations

from typing import Any

import sqlglot
from sqlglot import exp

from veto.core.models import Decision, FilterResult, ToolCallRequest
from veto.plugins.base import GuardPlugin

_SQL_ARG_KEYS = ("query", "sql", "statement", "command")

_FORBIDDEN_WRITE_TYPES = (
    exp.Drop,
    exp.Delete,
    exp.Update,
    exp.Insert,
    exp.Alter,
    exp.Create,
    exp.Command,
    exp.Merge,
)


def _extract_sql(arguments: dict[str, Any]) -> str | None:
    for key in _SQL_ARG_KEYS:
        val = arguments.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # Fallback: single string argument
    str_values = [v for v in arguments.values() if isinstance(v, str) and v.strip()]
    if len(str_values) == 1:
        return str_values[0].strip()
    return None


class SQLGuardPlugin(GuardPlugin):
    name = "sql_guard"
    description = "AST-based SQL inspection via sqlglot enforcing allowed statement types and row limits."

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        sql = _extract_sql(request.arguments)
        if not sql:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason="SQL guard fail-closed: no SQL query string found in arguments.",
            )

        allow_statements = {
            s.upper() for s in options.get("allow_statements", ["SELECT"])
        }
        max_limit = options.get("max_limit")
        dialect = options.get("dialect")

        try:
            statements = sqlglot.parse(sql, read=dialect)
        except Exception as exc:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"SQL parse error (fail-closed): {exc}",
            )

        statements = [stmt for stmt in statements if stmt is not None]
        if not statements:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason="SQL guard fail-closed: empty SQL statement.",
            )

        if len(statements) > 1:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"Stacked multi-statement SQL blocked ({len(statements)} statements detected).",
            )

        stmt = statements[0]
        stmt_type = stmt.key.upper()

        if stmt_type not in allow_statements:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"SQL statement '{stmt_type}' is forbidden. Allowed: {sorted(allow_statements)}.",
                details={"statement_type": stmt_type},
            )

        # Ensure no nested write/DDL statements inside CTEs or subqueries
        if allow_statements == {"SELECT"}:
            for node in stmt.walk():
                if isinstance(node, _FORBIDDEN_WRITE_TYPES):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Forbidden SQL operation '{node.key.upper()}' detected inside query AST.",
                        details={"forbidden_node": node.key.upper()},
                    )

        # Enforce max_limit when LIMIT is specified as a literal integer
        if max_limit is not None and isinstance(stmt, exp.Select):
            limit_expr = stmt.args.get("limit")
            if limit_expr is not None:
                limit_val_node = limit_expr.expression
                if isinstance(limit_val_node, exp.Literal) and limit_val_node.is_int:
                    limit_val = int(limit_val_node.this)
                    if limit_val > int(max_limit):
                        return FilterResult(
                            plugin_name=self.name,
                            passed=False,
                            decision=Decision.BLOCK,
                            reason=f"SQL LIMIT {limit_val} exceeds configured max_limit={max_limit}.",
                            details={"limit": limit_val, "max_limit": max_limit},
                        )

        return FilterResult(
            plugin_name=self.name,
            passed=True,
            decision=Decision.ALLOW,
            reason=f"Verified safe SQL ({stmt_type}).",
            details={"statement_type": stmt_type},
        )
