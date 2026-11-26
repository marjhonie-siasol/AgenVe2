"""AgenVe2 Execution Firewall - Universal Quickstart Demo

Demonstrates securing ANY AI agent workflow using AgenVe2.
AgenVe2 is completely model-agnostic and framework-neutral: it works with custom Python
agent loops, LangGraph, CrewAI, LlamaIndex, Ollama, or cloud LLM APIs.

Usage:
    uv run python examples/quickstart_demo.py
"""

from __future__ import annotations

import os

from agenve2 import AgenVe2BlockedError, AgenVe2Client

POLICY_PATH = os.getenv("AGENVE2_POLICY") or os.getenv("VETO_POLICY", "policy.example.yaml")

# 1. Initialize AgenVe2 Client (evaluates policies locally in < 3ms)
agenve2 = AgenVe2Client(policy=POLICY_PATH, agent_name="quickstart-demo-agent")


# 2. Define tools guarded by AgenVe2's deterministic policies
@agenve2.guard("postgres_query")
def postgres_query(query: str) -> str:
    return "[DATABASE EXECUTED]: Query succeeded -> 5 rows returned."


@agenve2.guard("read_file")
def read_file(path: str) -> str:
    return f"[FILE READ]: Successfully read {path}."


@agenve2.guard("run_shell")
def run_shell(command: str) -> str:
    return f"[SHELL EXECUTED]: Command '{command}' completed."


@agenve2.guard("refund_customer")
def refund_customer(user_id: int, amount: float) -> str:
    return f"[PAYMENT EXECUTED]: Refunded ${amount:.2f} to user #{user_id}."


def main() -> None:
    print("=" * 70)
    print("  AGENVE2 EXECUTION FIREWALL - UNIVERSAL DEMONSTRATION")
    print("=" * 70)
    print(f"Policy: {POLICY_PATH}")
    print("Zero LLM-as-a-judge latency. In-memory deterministic AST evaluation.")
    print("-" * 70)

    # 3. Simulate an AI Agent emitting tool calls
    scenarios = [
        ("Scenario 1: Harmless SQL Query", lambda: postgres_query("SELECT id, name FROM users LIMIT 10;")),
        ("Scenario 2: Rogue DROP TABLE (sql_guard AST)", lambda: postgres_query("DROP TABLE users CASCADE;")),
        ("Scenario 3: Secret .env Access (filesystem_guard)", lambda: read_file(".env")),
        ("Scenario 4: Safe File Read (filesystem_guard)", lambda: read_file("src/app.py")),
        ("Scenario 5: Dangerous Shell Command (shell_guard)", lambda: run_shell("rm -rf /")),
        ("Scenario 6: Safe Shell Command (shell_guard)", lambda: run_shell("git status")),
        ("Scenario 7: Excessive $5,000 Refund (param_bounds)", lambda: refund_customer(user_id=101, amount=5000.0)),
    ]

    for title, action in scenarios:
        print(f"\n>>> {title}")
        try:
            result = action()
            print(f"    [ALLOWED] -> {result}")
        except AgenVe2BlockedError as exc:
            rule = exc.report.get("rule_triggered", "policy")
            print(f"    [BLOCKED] -> {exc.reason} (Rule: {rule})")
        except Exception as exc:  # noqa: BLE001
            print(f"    [HALTED]  -> {exc}")

    print("\n" + "=" * 70)
    print("  All agent tool calls intercepted and verified.")
    print("=" * 70)


if __name__ == "__main__":
    main()
