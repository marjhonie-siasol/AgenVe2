# Security Policy for Veto

As an execution firewall designed to intercept and restrict autonomous AI tool calls, the security and reliability of Veto itself is our highest priority.

## Scope and Supported Versions

Veto operates directly between AI models and local execution runtimes (shell, SQL engines, filesystem, and external APIs). We actively provide security updates and patches for the current release branch:

| Version | Status | Security Patches |
| :--- | :--- | :--- |
| `0.1.x` (main) | Active Development | Supported |

## Core Security Invariants

When evaluating vulnerabilities in Veto, the following invariants must hold:

1. **Deterministic Fail-Closed Behavior:** In `enforce` mode, unhandled tools or malformed policy schemas must default to `BLOCK`.
2. **AST Analysis Integrity:** The SQL AST parser (`sqlglot`) and shell tokenizer must prevent evasion via comment injection, quote wrapping, or parameter smuggling.
3. **Sandbox Enforcement:** Filesystem sandboxing must resolve symlinks and canonical paths to prevent path traversal outside declared allowlists.
4. **Credential Isolation:** The secret scanner must redact high-entropy keys before writing to local SQLite audit stores or stdout.

## Reporting a Vulnerability

If you discover a security issue or bypass in Veto's policy engine, please report it responsibly:

* **Private Report:** Please use the **Report a vulnerability** button under the GitHub Security Advisory tab of this repository.
* **Direct Email:** Alternatively, you may contact the maintainers directly via `security@veto-firewall.dev`.

Please include:
* The version of Veto tested.
* A minimal `policy.yaml` demonstrating the rule configuration.
* The exact tool call payload and reproduction script.
* Expected vs. actual execution behavior.

We appreciate your assistance in keeping AI execution safe and transparent for all developers.
