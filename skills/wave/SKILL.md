---
name: wave
description: Delegate several independent ready AOD tasks to Codex in parallel, one per worktree slot, after checking dependencies and that their scopes do not overlap. Use when two or more tasks are ready and the user wants throughput.
---

# Parallel wave

A wave runs independent tasks at the same time, one per slot. CLI: `aod` means
`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. Each task in the wave must be `ready` after `/aod:preflight`. The packet `depends_on` lists real
   dependencies, and the `scope` globs are as narrow as the work allows. Overlapping scopes never run together.
2. Plan the wave: `aod wave plan [--max N]`. It picks ready Codex tasks in id order:
   - every dependency is `done`;
   - the scope overlaps neither another task in the wave nor any task still holding a slot;
   - there is at most one task per free slot.

   `deferred` explains why each other task waits. Show the user the wave in one line before running it.
3. Run it as a **background** shell command, so you are notified when every job has ended (do not poll):
   `aod wave run [--max N]`. Slots are created first, then the delegations start together. Each one follows the
   routing, exactly like `/aod:delegate`.
4. Read the result's `ran` list. Each entry has the same meaning as a `/aod:delegate` result:
   - `review` -> `/aod:verify` it;
   - `blocked` -> answer the question;
   - `failed` -> read `stderr.log`.

   Verify and close tasks **one at a time**. Each merge resets that slot and moves the base branch.
5. Exit 5 means Codex is unavailable or out of quota. Every affected task is back to `ready`. Stop and ask
   the user (`/aod:decision`).
6. Once the wave's tasks are closed, `aod wave plan` again. Tasks that depended on them are now eligible.

Do not run `/aod:delegate` for a task while a wave is running. A slot it picks may be one the wave
assigned.
Parallelism multiplies Codex usage: with the `max` preset, mention it before running waves of 3 or more.
