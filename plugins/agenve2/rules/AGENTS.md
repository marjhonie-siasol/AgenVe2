# AgenVe2 Execution Safety Rules

- Treat every `[AGENVE2 BLOCKED]` or `AgenVe2BlockedError` response as a hard operator security boundary. Never attempt to bypass, re-encode, chain shell commands, or work around an AgenVe2 policy block.
- When an operator denies an action with feedback in AgenVe2, follow the operator's feedback verbatim before retrying.
- Never store API keys, database passwords, or webhook tokens inside `policy.yaml`. Keep `policy.yaml` safe to commit to Git.
