# 2026-10-17 — M3 memory and sessions

Agent: architect   Task: none

## Done
- Skills: session-start, session-end, adr, spec (EARS), decision; preflight skill now runs `aod preflight`.
- CLI: session start/end, journal new/check, adr new/accept/supersede, spec new/check, preflight.
- Templates: spec (EARS + Acceptance tracing), journal; config `session.baseline`.
- 31 tests (new `tests/memory.test.mjs`). ADR-0004.

## Not done
- New skills not exercised live through the installed plugin yet.
- Spec approval by the PO is a convention only.

## Decisions
- ADR-0004: memory and session tooling; deterministic preflight with failure-reason heuristic.

## Open questions
- Codex project skill path (`.agents/skills` vs `.codex/skills`) — M4.

## Next step
- Start M4 (cross-family & routing): Codex implementer pack (AGENTS.md block, implementer skill, custom agent
  TOMLs), Claude-only fallback mode with Claude subagent implementers, routing presets, optional Codex review of
  Claude-written changes.
