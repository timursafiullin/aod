---
name: aod-close
description: Close an accepted AOD task - squash merge the implementer branch into the base branch with trailers, store the report, update the task ledger and reset the worktree slot. Use after /aod-verify gives ACCEPT.
---

# Close T-xxxx

1. Make sure the main checkout is on the base branch and has no uncommitted changes other than
   `.agents/tasks/index.*`.
2. Merge (refuses if gates did not pass or the branch moved since):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" merge T-xxxx --reviewed-by "<reviewer, e.g. claude-sonnet (fresh context)>" --attention <minutes of the user's attention, if known>`
   Add `--prune` to delete `task/T-xxxx` and `codex/T-xxxx` after the squash.
3. Confirm the base branch is green by running the project's test command.
4. Add a line to today's journal entry in `.agents/journal/` (create it from the README template if missing):
   what was merged, rounds, anything left for the backlog. Commit the journal with the next ledger change.
5. Pushing is the user's call; do not push unless asked.
