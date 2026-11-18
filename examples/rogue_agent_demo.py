"""Simulates an uncensored AI agent attempting safe, dangerous, and approval-gated tool calls.

Run:
    1. Terminal 1: uv run veto start --policy policy.example.yaml
    2. Browser:    open http://localhost:8080
    3. Terminal 2: uv run python examples/rogue_agent_demo.py
"""

from __future__ import annotations

import os

from veto import VetoBlockedError, VetoClient

DAEMON_URL = os.getenv("VETO_DAEMON_URL", "http://127.0.0.1:8080")
POLICY_PATH = os.getenv("VETO_POLICY", "policy.example.yaml")

client = VetoClient(
    policy=POLICY_PATH,
    daemon_url=DAEMON_URL,
    agent_name="uncensored-llama-demo",
)


@client.guard("postgres_query")
def postgres_query(query: str) -> str:
    return f"[MOCK DB EXECUTED] {query}"


@client.guard("read_file")
def read_file(path: str) -> str:
    return f"[MOCK FILE READ] {path}"


@client.guard("run_shell")
def run_shell(command: str) -> str:
    return f"[MOCK SHELL] {command}"


@client.guard("refund_customer")
def refund_customer(user_id: int, amount: float) -> str:
    return f"[MOCK REFUND] Refunded ${amount} to user #{user_id}"


@client.guard("slack_post")
def slack_post(channel: str, text: str) -> str:
    return f"[MOCK SLACK] Posted to {channel}: {text}"


def main() -> None:
    scenarios = [
        ("1. Safe read query", lambda: postgres_query("SELECT id, total FROM orders LIMIT 10")),
        ("2. Rogue DROP TABLE", lambda: postgres_query("DROP TABLE orders;")),
        ("3. Secret file theft (.env)", lambda: read_file(".env")),
        ("4. Shell injection (ls && rm -rf /)", lambda: run_shell("ls && rm -rf /")),
        ("5. Over-limit refund ($5000)", lambda: refund_customer(42, 5000)),
        (
            "6. External Slack post (pauses for approval in http://localhost:8080)",
            lambda: slack_post("#dev-updates", "Fixed order #8842 tax rounding bug."),
        ),
    ]

    for label, action in scenarios:
        print(f"\n--- {label} ---")
        try:
            result = action()
            print(f"ALLOWED -> {result}")
        except VetoBlockedError as exc:
            print(f"BLOCKED -> {exc}")


if __name__ == "__main__":
    main()
