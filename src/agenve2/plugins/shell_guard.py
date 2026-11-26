from __future__ import annotations

import os
import shlex
from typing import Any

from agenve2.core.models import Decision, FilterResult, ToolCallRequest
from agenve2.plugins.base import GuardPlugin

_SHELL_ARG_KEYS = ("command", "cmd", "script", "shell_command")

_CHAIN_OPERATORS = ("&&", "||", ";", "|", "\n", "\r", ">", "<")

_SUBSHELL_OPERATORS = ("`", "$(")

_POWERSHELL_EVASION_FLAGS = {"-encodedcommand", "-enc", "-ec", "-e"}
_POWERSHELL_EVASION_TERMS = ("invoke-expression", "iex")


def _find_chaining_operator(cmd: str) -> str | None:
    """Detect chaining/redirection outside quotes, plus command substitution outside single quotes."""
    in_single = False
    in_double = False
    i = 0
    n = len(cmd)

    while i < n:
        ch = cmd[i]
        if ch == "\\" and in_double and i + 1 < n and cmd[i + 1] in ('"', "\\", "$", "`"):
            i += 2
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue

        if not in_single:
            for op in _SUBSHELL_OPERATORS:
                if cmd.startswith(op, i):
                    return op

        if not in_single and not in_double:
            for op in _CHAIN_OPERATORS:
                if cmd.startswith(op, i):
                    return op

        i += 1
    return None

_DEFAULT_DENIED_COMMANDS = {
    "rm",
    "rmdir",
    "del",
    "erase",
    "format",
    "mkfs",
    "dd",
    "sudo",
    "su",
    "chmod",
    "chown",
    "shutdown",
    "reboot",
    "kill",
    "killall",
    "curl",
    "wget",
    "nc",
    "netcat",
    "ssh",
    "scp",
}

_DANGEROUS_GIT_SUBFLAGS = (
    ("--force",),
    ("-f",),
    ("reset", "--hard"),
    ("clean", "-fd"),
    ("clean", "-fdx"),
)


def _extract_command(arguments: dict[str, Any]) -> str | None:
    for key in _SHELL_ARG_KEYS:
        val = arguments.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    str_values = [v for v in arguments.values() if isinstance(v, str) and v.strip()]
    if len(str_values) == 1:
        return str_values[0].strip()
    return None


class ShellGuardPlugin(GuardPlugin):
    name = "shell_guard"
    description = "Inspects shell commands via shlex, blocking command chaining and unauthorized binaries."

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        cmd = _extract_command(request.arguments)
        if not cmd:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason="Shell guard fail-closed: no shell command found in arguments.",
            )

        block_chaining = options.get("block_chaining", True)
        if block_chaining:
            op = _find_chaining_operator(cmd)
            if op is not None:
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason=f"Shell chaining/redirection operator '{op.strip() or 'newline'}' is forbidden.",
                    details={"operator": op},
                )

        try:
            tokens = shlex.split(cmd, posix=(os.name != "nt"))
        except ValueError as exc:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"Malformed shell command (fail-closed): {exc}",
            )

        if not tokens:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason="Empty shell command blocked.",
            )

        raw_exec = tokens[0].strip("\"'")
        executable = os.path.basename(raw_exec).lower()
        executable = executable.removesuffix(".exe")

        if executable in {"powershell", "pwsh"}:
            lower_tokens = [t.strip("\"'").lower() for t in tokens[1:]]
            if any(t in _POWERSHELL_EVASION_FLAGS for t in lower_tokens) or any(
                term in tok for tok in lower_tokens for term in _POWERSHELL_EVASION_TERMS
            ):
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason="Obfuscated or dynamic PowerShell execution is forbidden.",
                    details={"executable": executable},
                )

        denied_commands = {
            c.lower() for c in options.get("denied_commands", _DEFAULT_DENIED_COMMANDS)
        }
        if executable in denied_commands:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason=f"Shell command '{executable}' is explicitly denied.",
                details={"executable": executable},
            )

        allowed_commands = options.get("allowed_commands")
        if allowed_commands is not None:
            allowed_set = {c.lower() for c in allowed_commands}
            if executable not in allowed_set:
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason=f"Shell command '{executable}' is not in allowed_commands: {sorted(allowed_set)}.",
                    details={"executable": executable},
                )

        # Extra safety check for destructive git flags even if git is allowed
        if executable == "git":
            lower_tokens = [t.lower() for t in tokens[1:]]
            for combo in _DANGEROUS_GIT_SUBFLAGS:
                if all(part in lower_tokens for part in combo):
                    return FilterResult(
                        plugin_name=self.name,
                        passed=False,
                        decision=Decision.BLOCK,
                        reason=f"Destructive git operation blocked ({' '.join(combo)}).",
                        details={"executable": "git", "flags": list(combo)},
                    )

        return FilterResult(
            plugin_name=self.name,
            passed=True,
            decision=Decision.ALLOW,
            reason=f"Verified safe shell command '{executable}'.",
            details={"executable": executable},
        )
