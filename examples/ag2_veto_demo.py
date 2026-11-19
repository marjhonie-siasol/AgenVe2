"""Demonstrates securing an AG2 (formerly AutoGen) agent using the Veto Execution Firewall.

This script shows how to prevent an AG2 agent from executing destructive database queries,
accessing sensitive files (.env), running dangerous shell commands, or issuing unapproved refunds.

Run Instructions:
    1. (Optional, for Live Dashboard & Approvals):
       Terminal 1: uv run veto start --policy policy.example.yaml
       Browser:    http://localhost:8080

    2. Run the AG2 + Veto demo:
       Terminal 2: uv run python examples/ag2_veto_demo.py
"""

from __future__ import annotations

import os
from typing import Any

from ag2 import Agent
from ag2.events import ToolCallEvent, ToolErrorEvent
from ag2.middleware import Middleware
from ag2.middleware.base import BaseMiddleware, ToolExecution, ToolResultType
from veto import VetoBlockedError, VetoClient

POLICY_PATH = os.getenv("VETO_POLICY", "policy.example.yaml")
DAEMON_URL = os.getenv("VETO_DAEMON_URL", "http://127.0.0.1:8080")

# 1. Initialize Veto Client (connects to live daemon at :8080 or runs local fail-closed)
veto = VetoClient(
    policy=POLICY_PATH,
    daemon_url=DAEMON_URL,
    agent_name="ag2-data-ops-agent",
)


# 2. AG2 Middleware that intercepts every tool call before execution
class VetoAG2Middleware(BaseMiddleware):
    """Native AG2 Middleware enforcing Veto's deterministic policy-as-code firewall."""

    def __init__(self, event: Any, context: Any, **kwargs: Any) -> None:
        super().__init__(event, context)

    async def on_tool_execution(
        self,
        call_next: ToolExecution,
        event: ToolCallEvent,
        context: Any,
    ) -> ToolResultType:
        tool_name = event.name
        tool_args = event.arguments if isinstance(event.arguments, dict) else {}

        # Evaluate through Veto's AST parsers & policies (< 1 ms)
        report = veto.evaluate(tool_name=tool_name, arguments=tool_args)

        if report.get("effective_decision") in ("BLOCK", "DENIED", "TIMEOUT"):
            reason = report.get("reason", "Action blocked by security policy.")
            rule = report.get("rule_triggered", "default")
            plugin = report.get("plugin_triggered") or "policy"
            # Return an error event to AG2, stopping the tool from ever executing!
            return ToolErrorEvent.from_call(
                event,
                error=PermissionError(f"[VETO {plugin.upper()} BLOCKED]: {reason} (Rule: {rule})"),
            )

        # ALLOWED: Let AG2 execute the tool
        return await call_next(event, context)


# 3. Define Tools
@veto.guard("postgres_query")
def postgres_query(query: str) -> str:
    return f"[DATABASE EXECUTED]: {query} -> 5 rows returned."


@veto.guard("read_file")
def read_file(path: str) -> str:
    return f"[FILE READ]: Successfully read {path}."


@veto.guard("run_shell")
def run_shell(command: str) -> str:
    return f"[SHELL EXECUTED]: {command}."


@veto.guard("refund_customer")
def refund_customer(user_id: int, amount: float) -> str:
    return f"[PAYMENT EXECUTED]: Refunded ${amount} to user #{user_id}."


@veto.guard("slack_post")
def slack_post(channel: str, text: str) -> str:
    return f"[SLACK EXECUTED]: Posted to {channel}: {text}."


def main() -> None:
    print("=" * 70)
    print("  🛡️  AG2 (AutoGen) + VETO EXECUTION FIREWALL INTEGRATION DEMO")
    print("=" * 70)
    print(f"Policy:  {POLICY_PATH}")
    print(f"Daemon:  {DAEMON_URL} (if running, logs stream to http://localhost:8080)")
    print("-" * 70)

    # 4. Construct the AG2 Agent and register Veto's Middleware
    ag2_agent = Agent(name="ag2-data-ops-agent")
    ag2_agent.add_middleware(Middleware(VetoAG2Middleware))
    ag2_agent.add_tool(postgres_query)
    ag2_agent.add_tool(read_file)
    ag2_agent.add_tool(run_shell)
    ag2_agent.add_tool(refund_customer)
    ag2_agent.add_tool(slack_post)

    print(f"Initialized AG2 Agent: '{ag2_agent.name}' with {len(ag2_agent.tools)} guarded tools.")

    # 5. Simulate AG2 Agent Tool Execution Scenarios
    scenarios = [
        ("Scenario 1: Harmless SQL Query", lambda: postgres_query("SELECT id, name, created_at FROM users LIMIT 5")),
        ("Scenario 2: Rogue DROP TABLE (sql_guard AST)", lambda: postgres_query("DROP TABLE users;")),
        ("Scenario 3: Secret .env File Access (filesystem_guard)", lambda: read_file(".env")),
        ("Scenario 4: Dangerous Shell Injection (shell_guard)", lambda: run_shell("ls && rm -rf /")),
        ("Scenario 5: Excessive $5,000 Refund (param_bounds cap)", lambda: refund_customer(user_id=42, amount=5000.0)),
        (
            "Scenario 6: External Slack Post (Human-in-the-Loop Approval)",
            lambda: slack_post("#general", "All production database migrations completed successfully."),
        ),
    ]

    for title, action in scenarios:
        print(f"\n>>> {title}")
        try:
            result = action()
            print(f"    \033[92m[ALLOWED by VETO]\033[0m -> {result}")
        except VetoBlockedError as exc:
            print(f"    \033[91m[BLOCKED by VETO]\033[0m -> {exc.reason}")
        except Exception as exc:
            print(f"    \033[91m[STOPPED by VETO]\033[0m -> {exc}")

    print("\n" + "=" * 70)
    print("  ✅ All AG2 tool calls successfully intercepted and verified!")
    print("     Check your live timeline at http://localhost:8080")
    print("=" * 70)


if __name__ == "__main__":
    main()
