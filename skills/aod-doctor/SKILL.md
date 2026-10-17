---
name: aod-doctor
description: Check whether this machine and repository are ready for Architect-Orchestrated Development (node, git, worktrees, Codex). Use when the user asks if AOD is set up, before /aod-init, or when an AOD command fails because of the environment.
---

# AOD doctor

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" doctor
```

Report the result to the user in two or three lines:

- If everything required is `ok`, say AOD is ready and name the mode (`claude+codex` or `claude-only`).
- For every `FAIL` or `warn` line, relay its `->` hint as the fix. Do not install anything yourself unless the user asks.
- In `claude-only` mode, explain that delegation will use fresh Claude subagents instead of Codex until Codex is installed and logged in.
