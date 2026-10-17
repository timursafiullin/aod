# 2026-10-17 — M1 delegation loop

Agent: architect   Task: none

## Done
- Codex spike (codex-cli 0.163.0): flags, JSONL events, stdin behaviour, install path -> ADR-0002.
- CLI: `init`, `slot`, `status`, `index render`, `packet new|validate`, `task commit|set`, `delegate`, `revise`,
  `gates`, `merge`, `reject`; libs for front matter, globs, JSON Schema subset, ledger, Codex locator.
- Skills: aod-init, aod-packet, aod-preflight, aod-delegate, aod-verify, aod-close; `aod-reviewer` subagent.
- 21 tests incl. 4 end-to-end scenarios with a fake Codex (happy path, out-of-scope + revise, skip marker, blocked + answer).
- Real run on `examples/toy-calculator` (scratch copy): packet -> preflight -> Codex -> gates -> review -> squash merge.

## Findings from the real run
- Preflight caught a wrong-reason failure: `node --test <dir>` on Node 22 treats the dir as a module.
- `aod task commit` could not amend an existing task branch -> rewritten with a temporary index (no branch switch).
- Codex `workspace-write` keeps `.git` read-only, `--add-dir` does not lift it -> AOD now commits for the
  implementer (ADR-0002 §5). Gates correctly flagged the first attempt (no commits, dirty slot, report `partial`).
- Second attempt: all gates green, 2 files in scope, ~79k input tokens (mostly cached), ACCEPT, merged.

## Not done
- Ledger `model` is empty when Codex uses its default model; record the actual model if events expose it.

## M1.1 (dry run with the installed plugin on aod-toy)
- Installed via local marketplace; one task through the skills with real Codex + reviewer subagent: ACCEPT, merged.
- Fixed all 11 findings (see CHANGELOG 0.2.1). Local-path installs run from the source checkout, so edits apply
  immediately; `claude plugin marketplace update aod` refreshes skill/agent names.

## Decisions
- ADR-0002 updated: AOD commits implementer changes; `task commit` uses plumbing.

## Open questions
- Codex project skill path (`.agents/skills` vs `.codex/skills`) — still open (M4).

## Next step
- Start M2: hooks (git guard, contract guard, Stop green, SessionStart briefing), slot pre-commit scope guard,
  integrity checks. Re-run the aod-toy dry run with `/aod:init` typed by the user to confirm finding 1 is gone.
