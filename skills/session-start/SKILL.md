---
name: session-start
description: Start an AOD architect session - restore state from the repository (journal next step, open tasks, slots, running jobs) and run the baseline checks before any new work. Use at the beginning of a working session or when the user says "let's continue" in an AOD project.
---

# Start an architect session

The architect remembers nothing between sessions; the repository does. CLI: `aod` means
`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod session start` — prints the last journal entry and its Next step, open tasks, running Codex jobs, slots,
   whether the main checkout is clean and on the base branch, any active contract unlock, and the result of the
   baseline commands (`session.baseline` in `.agents/aod.config.json`). `read_next` lists the roadmap and the
   packets of tasks in flight.
2. If the verdict is not `ready`, deal with that first: a red baseline is reported to the user before any new
   work; a dirty or off-base main checkout is explained, not silently reset.
3. Read only what `read_next` lists plus any ADR those packets reference. Delegate bulk reading of code to
   a subagent instead of reading it into this context.
4. Pick up exactly the journal's Next step unless the user asks otherwise. For tasks in `review`, continue with
   `/aod:verify`; for `blocked`, answer the question; for finished background jobs, read their results.
5. Tell the user in two or three lines: where things stand and what you will do now.
