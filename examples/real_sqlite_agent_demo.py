"""Real (non-mocked) SQLite + Filesystem Autonomous Agent Demo.

Runs real SQL queries against a real temporary SQLite database and real file reads,
demonstrating prompt-injection blocking and wildcard policy enforcement with AgenVe2.

Usage:
    uv run python examples/real_sqlite_agent_demo.py
"""

from __future__ import annotations

import asyncio
import sqlite3
import tempfile
from pathlib import Path

from agenve2 import AgenVe2BlockedError, AgenVe2Client
from agenve2.core.policy import PRESETS


def _seed_sqlite_db(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer TEXT, total REAL)"
        )
        conn.execute("DELETE FROM orders")
        conn.executemany(
            "INSERT INTO orders (customer, total) VALUES (?, ?)",
            [("Alice", 120.50), ("Bob", 49.00), ("Carol", 310.00)],
        )
        conn.commit()
    finally:
        conn.close()


async def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        policy_path = workdir / "policy.yaml"
        policy_path.write_text(PRESETS["strict"], encoding="utf-8")

        db_path = workdir / "orders.db"
        _seed_sqlite_db(db_path)

        notes_file = workdir / "release_notes.txt"
        notes_file.write_text("v0.2.0: Wildcard policies and outbound secret redaction.\n", encoding="utf-8")
        secret_file = workdir / ".env"
        secret_file.write_text("STRIPE_KEY=sk-proj-secret1234567890abcdefghij\n", encoding="utf-8")

        client = AgenVe2Client(
            policy=policy_path,
            agent_name="real-sqlite-ops-agent",
            database_url=f"sqlite:///{(workdir / 'audit.db').as_posix()}",
        )

        @client.guard("sqlite_query")
        async def sqlite_query(query: str) -> list[tuple]:
            conn = sqlite3.connect(db_path)
            try:
                return conn.execute(query).fetchall()
            finally:
                conn.close()

        @client.guard("read_text_file")
        async def read_text_file(path: str) -> str:
            return Path(path).read_text(encoding="utf-8")

        print("1. Real SQL SELECT (matched via *_query wildcard):")
        rows = await sqlite_query("SELECT id, customer, total FROM orders LIMIT 10")
        print("   ALLOWED ->", rows)

        print("2. Prompt-injected DROP TABLE:")
        try:
            await sqlite_query("DROP TABLE orders;")
        except AgenVe2BlockedError as exc:
            print("   BLOCKED ->", exc.reason)

        print("3. Real file read (matched via read_* wildcard):")
        text = await read_text_file(str(notes_file))
        print("   ALLOWED ->", text.strip())

        print("4. Secret file access (.env):")
        try:
            await read_text_file(str(secret_file))
        except AgenVe2BlockedError as exc:
            print("   BLOCKED ->", exc.reason)

        if client.repository is not None:
            client.repository.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
