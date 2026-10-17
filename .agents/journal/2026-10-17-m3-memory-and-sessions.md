# 2026-10-17 — M3 memory and sessions

Agent: architect   Task: none

## Done
- Skills: session-start, session-end, adr, spec (EARS), decision; preflight skill now runs `aod preflight`.
- CLI: session start/end, journal new/check, adr new/accept/supersede, spec new/check, preflight.
- Templates: spec (EARS + Acceptance tracing), journal; config `session.baseline`.
- 31 tests (new `tests/memory.test.mjs`). ADR-0004.

## Not done
- Spec approval by the PO is a convention only.

## M3.1 (dry run on aod-toy2 through the installed plugin)
- All 7 steps passed. Fixed the 13 findings: task commit refusal + `aod task sync`, shell-write guard,
  EARS comma handling, one ledger rule, session start/end, init and template gaps (ADR-0005).

## Decisions
- ADR-0004: memory and session tooling; deterministic preflight with failure-reason heuristic.
- ADR-0005: task branch sync, shell-write guard, ledger rule.

## Open questions
- Codex project skill path (`.agents/skills` vs `.codex/skills`) — M4.

## Next step
- Start M4 (cross-family & routing): Codex implementer pack (AGENTS.md block, implementer skill, custom agent
  TOMLs), Claude-only fallback mode with Claude subagent implementers, routing presets, optional Codex review of
  Claude-written changes.
