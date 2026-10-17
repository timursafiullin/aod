---
name: aod-verify
description: Verify an AOD task an implementer finished - deterministic gates first, then a fresh-context review of the diff, then a verdict (ACCEPT, REVISE or REJECT). Use when a delegated task reaches review status.
---

# Verify T-xxxx

Cheapest check first; stop at the first failing level.

## 1. Gates (no model tokens)

`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" gates T-xxxx`

Checks commits, clean slot, scope and forbidden paths, added skip/only/xfail markers, report schema, and re-runs
every acceptance command in the slot. Any failure -> REVISE with one blocker finding per failed gate. A weakened,
skipped or edited test is always a blocker.

## 2. Fresh-context review

Launch the `aod-reviewer` subagent (fresh context; do not review the diff in your own long context). Give it
only: the task id, the slot path from `aod status`, and the packet path. It returns a verdict and findings.
Also run the unit tests of the touched packages yourself if the acceptance commands do not cover them.

## 3. Verdict

- **ACCEPT**: gates green, no blocker/major findings -> `/aod-close T-xxxx`. Minor findings may go to the backlog.
- **REVISE**: write the findings to `.agents/tasks/jobs/T-xxxx/findings-<round>.md`, one per line:
  `F1 [blocker] path:line - <problem>. Required: <change>. Verify: <command>.`
  Then resume the same Codex thread in the background:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" revise T-xxxx --findings <file>`
  and verify again when notified. Exit 4 means the 3-round limit is reached: escalate to the user with the task, the disagreement, options and a recommendation.
- **REJECT** (wrong approach, wrong brief, repeated scope escapes):
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" reject T-xxxx`, then rewrite or split the packet.
