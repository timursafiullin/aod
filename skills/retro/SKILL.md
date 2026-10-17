---
name: retro
description: Run an AOD retrospective - loop metrics from the task ledger (first-pass acceptance, rounds, blocked and escalation rates, elapsed time, scope violations, architect share, attention minutes, token use) with signals and one action per signal. Use after 3-5 closed tasks or at the end of a milestone.
---

# Retro

Metrics come from `.agents/tasks/index.json` alone, with no extra infrastructure (methodology §18). CLI: `aod`
means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod retro [--milestone M5] [--since YYYY-MM-DD] --write` writes `.agents/plans/retro-<date>[-<milestone>].md`
   with a metrics table, a per-model table and signals.
2. For each signal, propose **one** concrete change to a packet template, playbook, rule, routing preset or
   preflight habit. Write it into the file's *Actions* section. Write "none" if no signal needs action.
   - Low first-pass acceptance or average rounds above 1.5: smaller tasks, sharper acceptance tests, more
     context in packets.
   - Blocked or escalations: decisions are missing; write ADRs before delegating.
   - Scope violations: look at each one. Either the scope glob was too narrow, or the implementer drifted.
   - High uncached token use (the cost driver; cached input is re-sent context): suggest
     `aod route preset balanced` or `economy`. The user decides.
3. A metric of `n/a`, or "fewer than 3 closed tasks", means the data is too thin. Say so rather than
   over-reading it.
4. Attention minutes come from `aod merge --attention N`. If none were recorded, ask the user to estimate
   them at the next close. Set `retro.weekly_token_pool` in `aod.config.json` to get pool %.
5. Show the user the signals and actions (summary first). The file is committed with the session
   (`aod session end --commit`).
