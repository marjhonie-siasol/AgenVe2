# Veto Execution Safety Rules

- Treat every `[VETO BLOCKED]` or `VetoBlockedError` response as a hard operator security boundary. Never attempt to bypass, re-encode, chain shell commands, or work around a Veto policy block.
- When an operator denies an action with feedback in Veto, follow the operator's feedback verbatim before retrying.
- Never store API keys, database passwords, or webhook tokens inside `policy.yaml`. Keep `policy.yaml` safe to commit to Git.
