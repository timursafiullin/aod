---
name: aod-packet
description: Cut a piece of work into an AOD task packet (T-xxxx) with scope globs, acceptance commands and acceptance tests, ready to delegate to an implementer. Use when the architect decomposes a feature or the user asks to create a task for Codex.
---

# Create a task packet

A good task: acceptance is a list of commands, scope is a list of globs, and it needs no taste or choice between
equal architectural options. Otherwise split it further or keep it for the architect.

1. Reserve the id and template:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" packet new "<imperative title>" --milestone <M>`
2. Edit `.agents/tasks/T-xxxx.md` (front matter is machine-checked):
   - `scope`: the narrowest globs the implementer may change (code and its unit tests).
   - `forbidden`: extra paths beyond the always-forbidden `schemas/**`, `tests/acceptance/**`, `.agents/**`.
   - `acceptance`: shell commands run from the repo root; every one must exit 0 when done.
   - `contracts`: schema paths and ADR ids that bind the task. `depends_on`: earlier task ids.
   - `budget_minutes`, `effort` (`low|medium|high`; use `high` only for hard tasks).
   - Body: Context (why, links), Design notes (decisions already made), Pitfalls, Out of scope. Reference files
     by path; do not paste their content.
3. Write the acceptance tests under `tests/acceptance/` (or the project's equivalent). They must test behaviour,
   not structure, and fail now for the expected reason (missing feature, not a syntax or import error).
4. Validate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" packet validate T-xxxx`
5. Commit packet and tests to `task/T-xxxx` (the main checkout stays on the base branch):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" task commit T-xxxx <acceptance test paths...>`
6. Next: `/aod-preflight T-xxxx`.
