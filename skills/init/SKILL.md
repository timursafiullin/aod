---
name: init
description: Set up Architect-Orchestrated Development in the current git repository - scaffolds .agents/ project memory, AGENTS.md, CLAUDE.md, aod.config.json and the task ledger. Use when the user wants to start using AOD in a project.
---

# Initialise AOD in this repository

1. Check the environment first:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" doctor`
   Stop and relay the hints if a required check fails.
2. Scaffold (idempotent; existing files are never overwritten):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" init`
   Add `--slots N` if the user asked for a different number of parallel implementers (default 2).
3. Relay what was created and skipped, and every line of `notes`.
4. Offer to fill in `.agents/context/vision.md`, `.agents/context/invariants.md`, `.agents/plans/roadmap.md`
   (milestones) and the `Commands` section of `AGENTS.md` together with the user. Ask for the product
   description, red lines, milestones and test commands; write them in English, short and checkable.
5. Suggest committing the scaffold on the base branch (`chore: set up AOD`). Do not commit without the user's
   go-ahead.

Notes:
- Worktree slots are created on the first delegation, next to the repository in `../<repo>-worktrees/codex-N`.
- `.agents/tasks/index.json` is the source of truth for tasks; never edit `index.md` by hand.
