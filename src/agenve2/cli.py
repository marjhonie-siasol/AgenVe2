from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import typer
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from agenve2.core.models import Decision, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PRESETS, PolicyError, PolicyLoader
from agenve2.proxy.mcp_proxy import run_mcp_proxy
from agenve2.server.app import AgenVe2Runtime, create_app
from agenve2.storage.repository import SQLModelAuditRepository, default_db_url

app = typer.Typer(
    name="agenve2",
    help="AgenVe2 — Open-source AI Agent Execution Firewall.",
    no_args_is_help=True,
)
audit_app = typer.Typer(help="Inspect and verify tamper-evident audit logs.")
app.add_typer(audit_app, name="audit")

console = Console()


def _resolve_policy_path(policy: Path | None) -> Path:
    if policy:
        return policy
    env_p = os.getenv("AGENVE2_POLICY") or os.getenv("VETO_POLICY")
    if env_p:
        return Path(env_p)
    default_local = Path("policy.yaml")
    if default_local.exists():
        return default_local
    example = Path("policy.example.yaml")
    if example.exists():
        return example
    return default_local


@app.command()
def init(
    output: Path = typer.Option(Path("policy.yaml"), "--output", "-o", help="Output policy file path."),
    preset: str = typer.Option("strict", "--preset", "-p", help="Starter preset: strict | coding | data"),
    force: bool = typer.Option(False, "--force", "-f", help="Overwrite existing policy file."),
) -> None:
    """Initialize a starter policy.yaml in the current workspace."""
    if preset not in PRESETS:
        console.print(f"[red]Unknown preset '{preset}'. Choose from: {', '.join(PRESETS)}[/red]")
        raise typer.Exit(code=1)
    if output.exists() and not force:
        console.print(f"[yellow]{output} already exists. Use --force to overwrite.[/yellow]")
        raise typer.Exit(code=1)
    output.write_text(PRESETS[preset], encoding="utf-8")
    console.print(
        Panel.fit(
            f"[green]Created[/green] [bold]{output}[/bold] (preset: [cyan]{preset}[/cyan])\n"
            f"Next: run [bold]agenve2 start[/bold] to launch the firewall & dashboard.",
            title="AgenVe2 Initialized",
        )
    )


@app.command()
def start(
    policy: Path | None = typer.Option(None, "--policy", "-p", help="Path to policy.yaml."),
    host: str = typer.Option("127.0.0.1", "--host", help="Bind host."),
    port: int = typer.Option(8080, "--port", help="Port for Gateway API and Web Dashboard."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Shadow mode: log blocks without enforcing."),
    no_ui: bool = typer.Option(False, "--no-ui", help="Disable embedded Web Dashboard."),
    db: Path | None = typer.Option(None, "--db", help="Custom SQLite audit DB path."),
) -> None:
    """Start the AgenVe2 Firewall Gateway and local Web Dashboard."""
    policy_path = _resolve_policy_path(policy)
    db_url = default_db_url(db) if db else None

    try:
        runtime = AgenVe2Runtime(
            policy_path=policy_path if policy_path.exists() else None,
            database_url=db_url,
            dry_run=dry_run,
        )
    except PolicyError as exc:
        console.print(f"[red]Policy error:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    mode_label = "[yellow]DRY-RUN (Shadow)[/yellow]" if runtime.pipeline.active_mode.value == "dry_run" else "[green]ENFORCE[/green]"
    kill_label = "[bold red]ENGAGED (ALL BLOCKED)[/bold red]" if runtime.pipeline.kill_switch else "[green]OFF[/green]"
    policy_display = str(policy_path) if policy_path.exists() else "fail-closed default (no policy.yaml found)"

    console.print(
        Panel.fit(
            f"[bold cyan]AgenVe2 AI Agent Firewall v0.1.0[/bold cyan]\n"
            f"  Policy:      [white]{policy_display}[/white]\n"
            f"  Mode:        {mode_label}\n"
            f"  Kill Switch: {kill_label}\n"
            f"  Audit DB:    [dim]{runtime.repository.database_url}[/dim]\n"
            f"  Dashboard:   [bold underline]http://{host}:{port}[/bold underline]"
            + (" (disabled)" if no_ui else ""),
            title="Firewall Active",
            border_style="cyan",
        )
    )

    fastapi_app = create_app(runtime=runtime, serve_dashboard=not no_ui)
    uvicorn.run(fastapi_app, host=host, port=port, log_level="warning")


@app.command(
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True}
)
def proxy(
    ctx: typer.Context,
    policy: Path | None = typer.Option(None, "--policy", "-p", help="Path to policy.yaml."),
    daemon_url: str = typer.Option("http://127.0.0.1:8080", "--daemon", help="Running AgenVe2 daemon URL."),
    agent: str = typer.Option("mcp-client", "--agent", help="Agent name recorded in audit logs."),
) -> None:
    """Transparently wrap an MCP stdio server: agenve2 proxy -- <command...>."""
    target_cmd = list(ctx.args)
    if target_cmd and target_cmd[0] == "--":
        target_cmd = target_cmd[1:]
    if not target_cmd:
        console.print("[red]Usage: agenve2 proxy -- <mcp-server-command...>[/red]")
        raise typer.Exit(code=1)

    policy_path = _resolve_policy_path(policy)
    exit_code = asyncio.run(
        run_mcp_proxy(
            target_command=target_cmd,
            policy_path=policy_path if policy_path.exists() else None,
            daemon_url=daemon_url,
            agent_name=agent,
        )
    )
    raise typer.Exit(code=exit_code)


@app.command()
def check(
    policy: Path | None = typer.Option(None, "--policy", "-p", help="Path to policy.yaml."),
) -> None:
    """Validate policy.yaml syntax and schema."""
    policy_path = _resolve_policy_path(policy)
    try:
        loader = PolicyLoader(policy_path)
        cfg = loader.load()
    except PolicyError as exc:
        console.print(f"[red]INVALID:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    console.print(
        f"[green]VALID[/green] {policy_path} "
        f"(mode={cfg.mode.value}, default={cfg.defaults.action.value}, rules={len(cfg.rules)})"
    )


@app.command()
def test(
    tool: str = typer.Option(..., "--tool", "-t", help="Tool name to simulate."),
    args: str = typer.Option("{}", "--args", "-a", help="JSON object of tool arguments."),
    policy: Path | None = typer.Option(None, "--policy", "-p", help="Path to policy.yaml."),
    agent: str = typer.Option("cli-simulator", "--agent", help="Simulated agent name."),
) -> None:
    """Simulate a tool call against policy.yaml without running an LLM."""
    try:
        parsed_args = json.loads(args)
        if not isinstance(parsed_args, dict):
            raise ValueError("--args must be a JSON object.")
    except Exception as exc:
        console.print(f"[red]Invalid --args JSON:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    policy_path = _resolve_policy_path(policy)
    loader = PolicyLoader(policy_path if policy_path.exists() else None)
    pipeline = EvaluationPipeline(policy_loader=loader)
    report = pipeline.evaluate(
        ToolCallRequest(agent_name=agent, tool_name=tool, arguments=parsed_args),
        skip_rate_limit=True,
    )

    color = (
        "green"
        if report.effective_decision == Decision.ALLOW
        else "yellow"
        if report.effective_decision == Decision.REQUIRE_APPROVAL
        else "red"
    )
    console.print(
        Panel.fit(
            f"Decision: [bold {color}]{report.effective_decision.value}[/bold {color}] ({report.latency_ms} ms)\n"
            f"Rule:     [cyan]{report.rule_triggered}[/cyan]\n"
            f"Plug-in:  {report.plugin_triggered or 'none'}\n"
            f"Reason:   {report.reason}",
            title=f"Simulation: {tool}",
            border_style=color,
        )
    )


@app.command()
def logs(
    limit: int = typer.Option(25, "--limit", "-n", help="Number of recent entries."),
    blocked: bool = typer.Option(False, "--blocked", help="Show only blocked/denied entries."),
    db: Path | None = typer.Option(None, "--db", help="Custom SQLite audit DB path."),
) -> None:
    """Inspect recent AgenVe2 audit logs from SQLite."""
    repo = SQLModelAuditRepository(default_db_url(db) if db else None)
    items = repo.list_logs(limit=limit, decision="BLOCK" if blocked else None)

    table = Table(title=f"AgenVe2 Audit Logs (showing {len(items)})")
    table.add_column("ID", style="dim")
    table.add_column("Timestamp", style="dim")
    table.add_column("Agent")
    table.add_column("Tool", style="cyan")
    table.add_column("Decision")
    table.add_column("Latency")
    table.add_column("Reason")

    for row in items:
        dec = row["effective_decision"]
        style = "green" if dec in ("ALLOW", "APPROVED") else "red"
        table.add_row(
            str(row["id"]),
            row["timestamp"][:19],
            row["agent_name"],
            row["tool_name"],
            f"[{style}]{dec}[/{style}]",
            f"{row['latency_ms']}ms",
            row["reason"][:70],
        )
    console.print(table)


@audit_app.command("verify")
def audit_verify(
    db: Path | None = typer.Option(None, "--db", help="Custom SQLite audit DB path."),
) -> None:
    """Verify SHA-256 hash-chain integrity of all audit entries."""
    repo = SQLModelAuditRepository(default_db_url(db) if db else None)
    ok, count, msg = repo.verify_chain()
    if ok:
        console.print(f"[green]OK:[/green] {msg}")
    else:
        console.print(f"[bold red]FAILED:[/bold red] {msg}")
        raise typer.Exit(code=1)


@app.command()
def kill(
    unlock: bool = typer.Option(False, "--unlock", help="Disengage the Global Kill Switch."),
    db: Path | None = typer.Option(None, "--db", help="Custom SQLite audit DB path."),
) -> None:
    """Engage (or --unlock) the persistent Global Kill Switch."""
    repo = SQLModelAuditRepository(default_db_url(db) if db else None)
    repo.set_kill_switch(not unlock)
    if unlock:
        console.print("[green]Global Kill Switch UNLOCKED. Normal policy enforcement resumed.[/green]")
    else:
        console.print("[bold red]GLOBAL KILL SWITCH ENGAGED. All agent tool executions are now BLOCKED.[/bold red]")
