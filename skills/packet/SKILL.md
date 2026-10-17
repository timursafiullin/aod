---
name: packet
description: Cut a piece of work into an AOD task packet (T-xxxx) with scope globs, acceptance commands and acceptance tests, ready to delegate to an implementer. Use when the architect decomposes a feature or the user asks to create a task for Codex.
---

# Create a task packet

A good task: acceptance is a list of commands, scope is a list of globs, and it needs no taste or choice between
equal architectural options. Otherwise split it further or keep it for the architect.

CLI: `aod` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

0. The spec and ADRs the packet will reference must be committed on the base branch first (`aod task commit`
   refuses otherwise): commit them as `docs: <ADR/spec ids>`.
1. Reserve the id and template. Take the milestone from `.agents/plans/roadmap.md` (use the current one):
   `aod packet new "<imperative title>" --milestone <M>`
2. Edit `.agents/tasks/T-xxxx.md` (front matter is machine-checked):
   - `scope`: the narrowest globs the implementer may change (code and its unit tests).
   - `forbidden`: extra paths beyond the always-forbidden `schemas/**`, `tests/acceptance/**`, `.agents/**`.
   - `acceptance`: shell commands run from the repo root; every one must exit 0 when done. Name test files
     explicitly (Node 22 `node --test` does not accept a directory).
   - `contracts`: schema paths and ADR ids that bind the task. `depends_on`: earlier task ids.
   - `budget_minutes`, `effort` (`low|medium|high`; use `high` only for hard tasks).
   - Replace every `<...>` placeholder; `aod packet validate` refuses leftovers.
   - Body: `Implements: R1, R2` (requirement ids from the spec, or `none`), Context (why, links), Design notes (decisions already made), Pitfalls, Out of scope. Reference files
     by path; do not paste their content.
3. Write the acceptance tests under `tests/acceptance/` (or the project's equivalent). They must test behaviour,
   not structure. Contracts and acceptance tests are guarded by a hook: first run
   `aod unlock --reason "acceptance tests for T-xxxx"` (time-boxed, logged), and `aod lock` after step 5.
4. Validate: `aod packet validate T-xxxx`
5. Commit packet and tests to `task/T-xxxx`:
   `aod task commit T-xxxx <acceptance test paths...>`
   This never switches the main checkout's branch; it moves the committed files off the base branch's working
   tree (they live on `task/T-xxxx`). To change the packet later: `aod packet restore T-xxxx`, edit, then
   `aod task commit T-xxxx [changed test paths...]` again. Read it any time with `aod packet show T-xxxx`.
   If a spec or ADR was committed on the base branch after `task/T-xxxx` was cut, `aod task sync T-xxxx` merges it in.
6. Next: `/aod:preflight T-xxxx`.

Ledger rule: `.agents/tasks/index.json` and `index.md` may stay uncommitted on the base branch while you work.
They are committed by `aod merge` (with the task) or by `aod session end --commit`, whichever comes first, and
never on a task branch.
