---
name: veto
description: Configure, test, and audit Veto AI Agent Execution Firewall policies (`policy.yaml`), MCP proxy wrappers, and tamper-evident SQLite audit logs.
---

# Veto Firewall Skill

Use this skill when helping a user configure, test, or troubleshoot **Veto**, the Python-native AI Agent Execution Firewall.

## Core Workflows

1. **Initialize Policy**:
   - Run `veto init --preset strict` (or `coding` / `data`) to create `policy.yaml`.
   - Never place API keys, passwords, or webhook secrets inside `policy.yaml`; store webhook secrets in `.env` (`VETO_WEBHOOK_URL`).

2. **Validate & Simulate Safely (No LLM Required)**:
   - Run `veto check --policy ./policy.yaml` before committing policy changes.
   - Run `veto test --tool <tool> --args '<json>'` to verify that dangerous actions (`DROP TABLE`, `.env`, `rm -rf`, out-of-bounds amounts) are blocked.

3. **Run Gateway & Dashboard**:
   - Launch `veto start --policy ./policy.yaml` to expose the local approval dashboard at `http://localhost:8080`.
   - Use `--dry-run` when onboarding a new workflow to inspect what would be blocked before enforcing.

4. **Wrap MCP Servers**:
   - Prepend `veto proxy --policy ./policy.yaml --` in front of any `stdio` MCP server command.

5. **Audit & Kill Switch**:
   - Inspect recent blocks: `veto logs --blocked`
   - Verify tamper-evident SHA-256 chain: `veto audit verify`
   - Emergency freeze: `veto kill` (and `veto kill --unlock` to resume)
