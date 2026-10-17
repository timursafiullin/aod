---
name: explore
description: Answer a "where is X / how does Y work" question about a large codebase with a cheap read-only Codex run that cites path:line, instead of reading many files into the architect's context. Use for bulk code reading in an AOD project.
---

# Read-only exploration by Codex

Reading a lot of code into the architect's context makes it a weaker reviewer (context rot). Ask one precise
question instead. CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod explore "<one precise question>" [--lines 30]` uses the `explore` routing model in a read-only sandbox.
   The answer cites `path:line` and says `unknown` instead of guessing.
2. Verify any claim you will act on by reading only the cited lines.
3. A broad question gets a vague answer: split it.
4. Exit code 5 means Codex is unavailable or out of quota: a Claude subagent on a small model can answer
   read-only questions instead. Tell the user you switched.
