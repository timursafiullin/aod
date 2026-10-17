---
name: verify
description: Verify an AOD task an implementer finished - deterministic gates first, then a fresh-context review of the diff, then a verdict (ACCEPT, REVISE or REJECT). Use when a delegated task reaches review status.
---

# Verify T-xxxx

Cheapest check first; stop at the first failing level. CLI: `aod` means
`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

## 1. Gates (no model tokens)

`aod gates T-xxxx`

Checks commits, clean slot at `codex/T-xxxx`, scope and forbidden paths, added skip/only/xfail markers, report
schema, and re-runs every acceptance command in the slot. Any failure -> REVISE with one blocker finding per
failed gate. A weakened, skipped or edited test is always a blocker. Integrity checks also fail on deleted tests
and on production code that detects a test run; they only warn (`warnings` in the result) on modified existing
tests, changed tolerances and comparisons against acceptance-test literals. Pass every warning to the reviewer.

## 2. Fresh-context review

Launch the `aod:reviewer` subagent (fresh context; do not review the diff in your own long context). Give it
only: the task id, the slot path (from `aod status`), the main repository path and any gate `warnings`. It is read-only and returns a
verdict and findings. Also run the unit tests of the touched packages if the acceptance commands do not cover
them.

## 3. Verdict

- **ACCEPT**: gates green, no blocker/major findings -> `/aod:close T-xxxx`. Minor findings go to the journal's
  backlog line.
- **REVISE**: write the findings to `.agents/tasks/jobs/T-xxxx/findings-<round>.md`, one per line:
  `F1 [blocker] path:line - <problem>. Required: <change>. Verify: <command>.`
  Then resume the same Codex thread in the background: `aod revise T-xxxx --findings <file>`
  and verify again when notified. `rounds` in the ledger counts REVISE rounds only. Exit 4 means the 3-round
  limit is reached: escalate to the user with the task, the disagreement, options and a recommendation.
- **REJECT** (wrong approach, wrong brief, repeated scope escapes): `aod reject T-xxxx`, then rewrite or split
  the packet.
