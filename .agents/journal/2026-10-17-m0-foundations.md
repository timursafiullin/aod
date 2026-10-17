# 2026-10-17 — M0 foundations

Agent: architect   Task: none

## Done
- Read AOD 1.0 methodology and AOD 2.0 research; wrote roadmap (`.agents/plans/roadmap.md`) and ADR-0001.
- Plugin + marketplace manifests, Apache-2.0 license, CI matrix (3 OS × Node 20/22).
- `scripts/aod.mjs` with `--version` and `doctor`; `aod-doctor` skill; 8 node:test tests passing.

## Not done
- Local install test via `/plugin marketplace add ./` (needs an interactive Claude Code session).
- Codex flag spike: `codex` not installed on this machine.

## Decisions
- ADR-0001: zero-dependency Node CLI, Claude Code plugin, Claude-only fallback mode.

## Open questions
- Codex project skill path (`.agents/skills` vs `.codex/skills`).

## Next step
- Install Codex (`npm i -g @openai/codex`, `codex login`), run `codex exec --help`, record flags in ADR-0001,
  then start M1 with `templates/` and `aod init`.
