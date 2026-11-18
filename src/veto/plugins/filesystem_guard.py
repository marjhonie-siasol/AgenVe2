from __future__ import annotations

import fnmatch
from pathlib import Path
from typing import Any

from veto.core.models import Decision, FilterResult, ToolCallRequest
from veto.plugins.base import GuardPlugin

_PATH_ARG_KEYS = (
    "path",
    "file_path",
    "filepath",
    "filename",
    "file",
    "target",
    "directory",
    "dir",
    "src",
    "dst",
)

_DEFAULT_DENIED_PATTERNS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "**/.ssh/**",
    "*id_rsa*",
    "*id_ed25519*",
]


def _extract_paths(arguments: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key in _PATH_ARG_KEYS:
        val = arguments.get(key)
        if isinstance(val, str) and val.strip():
            paths.append(val.strip())
    return paths


def _matches_denied(raw_path: str, resolved: Path, patterns: list[str]) -> str | None:
    candidates = {
        raw_path.replace("\\", "/"),
        resolved.as_posix(),
        resolved.name,
    }
    parts_lower = [p.lower() for p in resolved.parts]
    for pattern in patterns:
        pat_norm = pattern.replace("\\", "/")
        for cand in candidates:
            if fnmatch.fnmatch(cand.lower(), pat_norm.lower()):
                return pattern
            # Handle **/.ssh/** style patterns against path segments
            stripped = pat_norm.strip("*").strip("/")
            if stripped and stripped.lower() in parts_lower:
                return pattern
    return None


class FilesystemGuardPlugin(GuardPlugin):
    name = "filesystem_guard"
    description = "Sandboxes file paths within allowed_roots and blocks traversal or sensitive secret files."

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        raw_paths = _extract_paths(request.arguments)
        if not raw_paths:
            return FilterResult(
                plugin_name=self.name,
                passed=False,
                decision=Decision.BLOCK,
                reason="Filesystem guard fail-closed: no file path argument found.",
            )

        base_dir = Path(options.get("base_dir", ".")).resolve()
        allowed_roots_raw = options.get("allowed_roots", ["."])
        allowed_roots = [
            (Path(r).expanduser() if Path(r).expanduser().is_absolute() else base_dir / r).resolve()
            for r in allowed_roots_raw
        ]
        denied_patterns = list(options.get("denied_patterns", _DEFAULT_DENIED_PATTERNS))

        for raw_path in raw_paths:
            expanded = Path(raw_path).expanduser()
            resolved = (expanded if expanded.is_absolute() else base_dir / expanded).resolve()

            matched = _matches_denied(raw_path, resolved, denied_patterns)
            if matched:
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason=f"Access to '{raw_path}' blocked by denied pattern '{matched}'.",
                    details={"path": raw_path, "pattern": matched},
                )

            inside_allowed = False
            for root in allowed_roots:
                try:
                    resolved.relative_to(root)
                    inside_allowed = True
                    break
                except ValueError:
                    continue

            if not inside_allowed:
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason=f"Path traversal / outside sandbox blocked: '{raw_path}' resolves outside allowed_roots.",
                    details={"path": raw_path, "resolved": str(resolved)},
                )

        return FilterResult(
            plugin_name=self.name,
            passed=True,
            decision=Decision.ALLOW,
            reason=f"Verified safe file path(s): {', '.join(raw_paths)}.",
        )
