from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from agenve2.core.models import PolicyAction, PolicyMode


class PluginConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    enabled: bool = True

    def plugin_options(self) -> dict[str, Any]:
        return dict(self.model_extra or {})


class DefaultsConfig(BaseModel):
    action: PolicyAction = PolicyAction.DENY
    approval_timeout_seconds: int = Field(default=120, ge=1, le=3600)
    retention_days: int = Field(default=90, ge=1, le=3650)


class RateLimitConfig(BaseModel):
    max_calls_per_minute: int = Field(default=30, ge=1, le=10000)


class RuleConfig(BaseModel):
    action: PolicyAction = PolicyAction.DENY
    description: str = ""
    message: str = ""
    plugins: list[PluginConfig] = Field(default_factory=list)


class PolicyConfig(BaseModel):
    version: str = "1"
    mode: PolicyMode = PolicyMode.ENFORCE
    defaults: DefaultsConfig = Field(default_factory=DefaultsConfig)
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    global_plugins: list[PluginConfig] = Field(default_factory=list)
    rules: dict[str, RuleConfig] = Field(default_factory=dict)

    @classmethod
    def fail_closed_default(cls) -> PolicyConfig:
        """Minimal safe fail-closed policy when no valid policy is loaded."""
        return cls(
            version="1",
            mode=PolicyMode.ENFORCE,
            defaults=DefaultsConfig(action=PolicyAction.DENY),
            global_plugins=[
                PluginConfig(name="secret_scanner", enabled=True),
                PluginConfig(name="rate_limiter", enabled=True),
            ],
            rules={},
        )


PRESETS: dict[str, str] = {
    "strict": """version: "1"
mode: enforce

defaults:
  action: deny
  approval_timeout_seconds: 120
  retention_days: 90

global_plugins:
  - name: secret_scanner
    enabled: true
  - name: rate_limiter
    enabled: true
    max_calls_per_minute: 30

rules:
  postgres_query:
    action: allow
    description: "Allow read-only SQL queries up to 500 rows."
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 500

  "*_query":
    action: allow
    description: "Allow read-only SQL queries across MCP servers."
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 500

  read_file:
    action: allow
    description: "Allow reading project files while blocking secrets and path escapes."
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns: [".env*", "*.pem", "*.key", "**/.ssh/**", "*id_rsa*"]

  "read_*":
    action: allow
    description: "Allow read_* MCP file tools within project root."
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns: [".env*", "*.pem", "*.key", "**/.ssh/**", "*id_rsa*"]

  "list_*":
    action: allow
    description: "Allow directory listing tools within project root."
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]

  run_shell:
    action: allow
    description: "Allow only safe read/test shell commands."
    plugins:
      - name: shell_guard
        allowed_commands: [ls, dir, pwd, git, pytest, echo]
        block_chaining: true

  slack_post:
    action: require_approval
    description: "External team messaging requires operator sign-off."
    message: "Review Slack message content before sending."

  refund_customer:
    action: require_approval
    description: "Require approval for refunds and hard-block amounts above $500."
    plugins:
      - name: param_bounds
        bounds:
          amount:
            min: 0
            max: 500
""",
    "coding": """version: "1"
mode: enforce

defaults:
  action: require_approval
  approval_timeout_seconds: 120
  retention_days: 90

global_plugins:
  - name: secret_scanner
    enabled: true
  - name: rate_limiter
    enabled: true
    max_calls_per_minute: 60

rules:
  "read_*":
    action: allow
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns: [".env*", "*.pem", "*.key", "**/.ssh/**"]

  "list_*":
    action: allow
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]

  "write_*":
    action: allow
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns: [".env*", "*.pem", "*.key", "**/.git/**"]

  "edit_*":
    action: allow
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns: [".env*", "*.pem", "*.key", "**/.git/**"]

  run_shell:
    action: allow
    plugins:
      - name: shell_guard
        allowed_commands: [ls, dir, pwd, git, pytest, python, uv, npm, ruff]
        block_chaining: true

  git_push:
    action: require_approval
    message: "Confirm branch push before touching remote repository."
""",
    "data": """version: "1"
mode: enforce

defaults:
  action: deny
  approval_timeout_seconds: 120
  retention_days: 90

global_plugins:
  - name: secret_scanner
    enabled: true
  - name: rate_limiter
    enabled: true
    max_calls_per_minute: 40

rules:
  postgres_query:
    action: allow
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 1000

  sqlite_query:
    action: allow
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 1000

  "*_query":
    action: allow
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 1000

  export_report:
    action: require_approval
    message: "Approve data export before writing external report."
""",
}


class PolicyError(Exception):
    """Raised when a YAML policy cannot be loaded or validated."""


class PolicyLoader:
    """Loads, validates, and hot-reloads YAML policy configurations."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path: Path | None = Path(path) if path else None
        self._mtime: float | None = None
        self._raw_yaml: str = ""
        self._config: PolicyConfig = PolicyConfig.fail_closed_default()
        if self.path and self.path.exists():
            self.load()

    @property
    def config(self) -> PolicyConfig:
        return self._config

    @property
    def raw_yaml(self) -> str:
        if self._raw_yaml:
            return self._raw_yaml
        return yaml.safe_dump(self._config.model_dump(mode="json"), sort_keys=False)

    def load(self) -> PolicyConfig:
        if not self.path:
            raise PolicyError("No policy path configured.")
        if not self.path.exists():
            raise PolicyError(f"Policy file not found: {self.path}")
        raw = self.path.read_text(encoding="utf-8")
        config = self.parse_yaml(raw)
        self._raw_yaml = raw
        self._config = config
        self._mtime = self.path.stat().st_mtime
        return config

    def parse_yaml(self, raw_yaml: str) -> PolicyConfig:
        try:
            data = yaml.safe_load(raw_yaml)
        except yaml.YAMLError as exc:
            raise PolicyError(f"Invalid YAML syntax: {exc}") from exc
        if data is None:
            data = {}
        if not isinstance(data, dict):
            raise PolicyError("Policy root must be a YAML mapping/object.")
        try:
            return PolicyConfig.model_validate(data)
        except ValidationError as exc:
            raise PolicyError(f"Policy schema validation failed: {exc}") from exc

    def update_from_yaml(self, raw_yaml: str, persist: bool = True) -> PolicyConfig:
        config = self.parse_yaml(raw_yaml)
        self._config = config
        self._raw_yaml = raw_yaml
        if persist and self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(raw_yaml, encoding="utf-8")
            self._mtime = self.path.stat().st_mtime
        return config

    def reload_if_changed(self) -> bool:
        if not self.path or not self.path.exists():
            return False
        current_mtime = self.path.stat().st_mtime
        if self._mtime is None or current_mtime > self._mtime:
            try:
                self.load()
                return True
            except PolicyError:
                # Fail-closed on hot-reload parse error: fall back to deny-all
                self._config = PolicyConfig.fail_closed_default()
                self._mtime = current_mtime
                return True
        return False


def generate_policy_yaml(tool_names: list[str]) -> str:
    """Synthesize a least-privilege starter policy.yaml from observed tool names."""
    seen = sorted({name.strip() for name in tool_names if name and name.strip()})
    rules: dict[str, Any] = {}

    for name in seen:
        low = name.lower()
        if any(k in low for k in ("query", "sql", "select")):
            rules[name] = {
                "action": "allow",
                "description": f"Auto-generated read-only SQL guard for {name}.",
                "plugins": [{"name": "sql_guard", "allow_statements": ["SELECT"], "max_limit": 500}],
            }
        elif low.startswith(("read_", "list_", "get_", "search_", "directory_")) or low in {
            "read_file",
            "list_directory",
        }:
            rules[name] = {
                "action": "allow",
                "description": f"Auto-generated sandboxed read rule for {name}.",
                "plugins": [
                    {
                        "name": "filesystem_guard",
                        "allowed_roots": ["."],
                        "denied_patterns": [".env*", "*.pem", "*.key", "**/.ssh/**", "*id_rsa*"],
                    }
                ],
            }
        elif any(k in low for k in ("shell", "bash", "terminal", "exec", "command")):
            rules[name] = {
                "action": "require_approval",
                "message": f"Confirm shell execution for {name}.",
                "plugins": [
                    {
                        "name": "shell_guard",
                        "allowed_commands": ["ls", "dir", "pwd", "git", "pytest", "echo"],
                        "block_chaining": True,
                    }
                ],
            }
        else:
            rules[name] = {
                "action": "require_approval",
                "message": f"Review {name} call before execution.",
            }

    doc = {
        "version": "1",
        "mode": "enforce",
        "defaults": {"action": "deny", "approval_timeout_seconds": 120, "retention_days": 90},
        "global_plugins": [
            {"name": "secret_scanner", "enabled": True},
            {"name": "rate_limiter", "enabled": True, "max_calls_per_minute": 30},
        ],
        "rules": rules,
    }
    return yaml.safe_dump(doc, sort_keys=False)
