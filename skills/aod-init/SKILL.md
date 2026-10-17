---
name: aod-init
description: Set up Architect-Orchestrated Development in the current git repository - scaffolds .agents/ project memory, AGENTS.md, CLAUDE.md, aod.config.json, the task ledger and Codex worktree slots. Use when the user wants to start using AOD in a project.
disable-model-invocation: true
---

# Initialise AOD in this repository

1. Check the environment first:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" doctor`
   Stop and relay the hints if a required check fails.
2. Scaffold (idempotent; existing files are never overwritten):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" init`
   Add `--slots N` if the user asked for a different number of parallel implementers (default 2).
3. Relay what was created and skipped, plus any `notes` (for example: commit first, then `aod slot create --all`).
4. Offer to fill in `.agents/context/vision.md`, `.agents/context/invariants.md` and the `Commands` section of
   `AGENTS.md` together with the user. Ask for the product description, red lines and test commands; write
   them in English, short and checkable.
5. Suggest committing the scaffold (`chore: set up AOD`) on the base branch. Do not commit without the user's go-ahead.

Notes:
- Slots live next to the repository in `../<repo>-worktrees/codex-N`.
- `.agents/tasks/index.json` is the source of truth for tasks; never edit `index.md` by hand.
