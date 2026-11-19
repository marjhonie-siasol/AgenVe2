---
name: agenve2
description: Configure, test, and audit AgenVe2 AI Agent Execution Firewall policies (`policy.yaml`), MCP proxy wrappers, and tamper-evident SQLite audit logs.
---

# AgenVe2 Firewall Skill

Use this skill when helping a user configure, test, or troubleshoot **AgenVe2**, the Python-native AI Agent Execution Firewall.

## Core Workflows

1. **Initialize Policy**:
   - Run `agenve2 init --preset strict` (or `coding` / `data`) to create `policy.yaml`.
   - Never place API keys, passwords, or webhook secrets inside `policy.yaml`; store webhook secrets in `.env` (`AGENVE2_WEBHOOK_URL`).

2. **Validate & Simulate Safely (No LLM Required)**:
   - Run `agenve2 check --policy ./policy.yaml` before committing policy changes.
   - Run `agenve2 test --tool <tool> --args '<json>'` to verify that dangerous actions (`DROP TABLE`, `.env`, `rm -rf`, out-of-bounds amounts) are blocked.

3. **Run Gateway & Dashboard**:
   - Launch `agenve2 start --policy ./policy.yaml` to expose the local approval dashboard at `http://localhost:8080`.
   - Use `--dry-run` when onboarding a new workflow to inspect what would be blocked before enforcing.

4. **Wrap MCP Servers**:
   - Prepend `agenve2 proxy --policy ./policy.yaml --` in front of any `stdio` MCP server command.

5. **Audit & Kill Switch**:
   - Inspect recent blocks: `agenve2 logs --blocked`
   - Verify tamper-evident SHA-256 chain: `agenve2 audit verify`
   - Emergency freeze: `agenve2 kill` (and `agenve2 kill --unlock` to resume)
