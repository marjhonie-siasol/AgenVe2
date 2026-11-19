# Contributing to AgenVe2

Thank you for your interest in contributing to AgenVe2. As an execution firewall for autonomous AI workflows, we welcome contributions that strengthen our AST parsers, add new security plugins, improve performance, or expand framework integrations.

## Local Development Workflow

AgenVe2 is built with Python 3.11+ and uses `uv` for project and package management.

### Prerequisites

* Python 3.11 or higher
* `uv` package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
* Node.js 18+ (only if modifying the React dashboard in `dashboard/`)

### Setup Environment

```bash
git clone https://github.com/marjhonie-siasol/AgenVe2.git
cd AgenVe2
uv sync --extra dev
```

### Running Tests

We maintain an automated test suite across all security plugins, storage backends, and API routes:

```bash
uv run pytest
```

### Code Formatting and Linting

We enforce formatting and static checks using `ruff`:

```bash
uv run ruff check .
uv run ruff format . --check
```

## Adding a New Security Plugin

AgenVe2 uses a microkernel architecture. To contribute a new security check:

1. Create a new plugin file in `src/agenve2/plugins/` inheriting from `BasePlugin`.
2. Implement the `evaluate(request: ToolCallRequest, options: dict) -> PluginResult` method.
3. Ensure all checks run in under 5 milliseconds using deterministic AST or pattern matching (avoid external network calls or LLM evaluations inside the evaluation pipeline).
4. Register the plugin in `src/agenve2/plugins/__init__.py`.
5. Add unit tests in `tests/test_plugins.py` verifying both `ALLOW` and `BLOCK` scenarios.

## Submitting Pull Requests

* Open a descriptive pull request against the `main` branch.
* Ensure all tests pass (`uv run pytest`) and code is formatted.
* Provide a brief explanation of the security property or tool integration being introduced.
