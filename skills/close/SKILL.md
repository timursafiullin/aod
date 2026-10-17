---
name: close
description: Close an accepted AOD task - squash merge the implementer branch into the base branch with trailers, the report, the ledger and the journal entry in one commit, then reset the worktree slot. Use after /aod:verify gives ACCEPT.
---

# Close T-xxxx

CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. Write the journal line first, in today's entry `.agents/journal/YYYY-MM-DD-<slug>.md` (create it from
   `.agents/journal/README.md` if missing): what was merged, rounds, reviewer verdict, backlog items from minor
   findings. Leave it uncommitted.
2. The main checkout must be on the base branch with no uncommitted changes except the ledger
   (`.agents/tasks/index.*`) and that journal file.
3. Merge (refuses if gates did not pass, the branch or slot changed since, or there are conflicts):
   `aod merge T-xxxx --reviewed-by "<reviewer, e.g. aod:reviewer (sonnet, fresh context)>" --journal .agents/journal/<file>.md --attention <minutes of the user's attention, if known>`
   One squash commit then holds the code, the packet, the acceptance tests, the report, the ledger and the
   journal. Add `--prune` to delete `task/T-xxxx` and `codex/T-xxxx` afterwards.
4. Confirm the base branch is green by running the project's test command.
5. Pushing is the user's call; do not push unless asked.
6. After every 3-5 closed tasks, or at the end of a milestone, suggest `/aod:retro`.

Ledger rule: `.agents/tasks/index.json` and `index.md` may stay uncommitted on the base branch while you work.
They are committed by `aod merge` (with the task) or by `aod session end --commit`, whichever comes first, and
never on a task branch.
