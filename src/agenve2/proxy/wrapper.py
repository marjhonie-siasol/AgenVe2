from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any


def discover_mcp_configs() -> list[tuple[str, Path]]:
    """Return existing IDE/client MCP configuration files on this machine."""
    home = Path.home()
    candidates: list[tuple[str, Path]] = [
        ("Antigravity", home / ".gemini" / "antigravity" / "mcp_config.json"),
        ("Cursor", home / ".cursor" / "mcp.json"),
        ("Claude Code", home / ".claude.json"),
    ]
    if os.name == "nt":
        appdata = os.getenv("APPDATA")
        if appdata:
            candidates.append(
                ("Claude Desktop", Path(appdata) / "Claude" / "claude_desktop_config.json")
            )
    elif sys.platform == "darwin":
        candidates.append(
            (
                "Claude Desktop",
                home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json",
            )
        )
    else:
        candidates.append(
            ("Claude Desktop", home / ".config" / "Claude" / "claude_desktop_config.json")
        )

    return [(client, path) for client, path in candidates if path.exists()]


def _is_wrapped(server_cfg: dict[str, Any]) -> bool:
    cmd = str(server_cfg.get("command", "")).lower()
    args = [str(a) for a in server_cfg.get("args", [])]
    if "agenve2" in Path(cmd).name.lower() and args[:1] == ["proxy"]:
        return True
    return len(args) >= 3 and args[0] == "-m" and args[1] == "agenve2.cli" and args[2] == "proxy"


def wrap_mcp_config(
    config_path: Path,
    policy_path: Path,
    daemon_url: str = "http://127.0.0.1:8080",
    python_executable: str | None = None,
) -> tuple[int, Path]:
    """Wrap stdio MCP servers in config_path with `agenve2 proxy`. Returns (wrapped_count, backup_path)."""
    data = json.loads(config_path.read_text(encoding="utf-8"))
    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        return 0, config_path

    backup_path = config_path.with_suffix(config_path.suffix + ".agenve2.bak")
    if not backup_path.exists():
        shutil.copy2(config_path, backup_path)

    py_exe = python_executable or sys.executable
    wrapped = 0
    for server_name, cfg in servers.items():
        if not isinstance(cfg, dict) or "command" not in cfg:
            continue
        if _is_wrapped(cfg):
            continue

        orig_cmd = str(cfg["command"])
        orig_args = [str(a) for a in cfg.get("args", [])]
        cfg["command"] = py_exe
        cfg["args"] = [
            "-m",
            "agenve2.cli",
            "proxy",
            "--policy",
            str(policy_path.resolve()),
            "--daemon",
            daemon_url,
            "--agent",
            str(server_name),
            "--",
            orig_cmd,
            *orig_args,
        ]
        wrapped += 1

    if wrapped:
        config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return wrapped, backup_path


def restore_mcp_config(config_path: Path) -> int:
    """Restore an MCP config from its AgenVe2 backup or unwrap proxy args inline."""
    backup_path = config_path.with_suffix(config_path.suffix + ".agenve2.bak")
    if backup_path.exists():
        shutil.move(str(backup_path), str(config_path))
        return 1

    data = json.loads(config_path.read_text(encoding="utf-8"))
    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        return 0

    restored = 0
    for cfg in servers.values():
        if not isinstance(cfg, dict) or not _is_wrapped(cfg):
            continue
        args = [str(a) for a in cfg.get("args", [])]
        if "--" in args:
            sep_idx = args.index("--")
            orig = args[sep_idx + 1 :]
            if orig:
                cfg["command"] = orig[0]
                cfg["args"] = orig[1:]
                restored += 1

    if restored:
        config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return restored
