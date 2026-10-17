# 2026-10-17 — M2 guardrails

Agent: architect   Task: none

## Done
- Hooks (ADR-0003): SessionStart briefing (+ invariants after compaction), git guard, contract guard with
  `aod unlock|lock`, opt-in Stop "done means green"; all silent outside AOD repos, fail open on errors.
- Slot pre-commit scope guard via per-worktree `core.hooksPath` + `aod scope check`; main checkout hooks untouched.
- Integrity checks in gates (fail/warn levels); ledger `failures` with reject-and-split hint at 2.
- 27 tests (new `tests/hooks.test.mjs`, shared `tests/helpers.mjs`).
- Live check with headless Claude (haiku) in aod-toy: briefing injected (quoted the journal next step) and
  `git rebase main` blocked by the git guard with the hook message shown to the model.

## Not done
- Contract guard and Stop gate not exercised live (unit/integration tested only).
- Bash-level writes to protected paths are not guarded (documented in ADR-0003).

## Decisions
- ADR-0003: guardrails as hooks; Stop gate opt-in; per-worktree hooksPath for slots.

## Open questions
- Codex-side hooks for implementers (Codex CLI has hooks) — evaluate in M4.

## Next step
- Start M3 (memory & session): session-start/end skills, aod-adr, aod-spec (EARS), aod-decision, journal tooling,
  full preflight consistency check.
