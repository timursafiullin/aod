# ADR-0003: Guardrails as hooks, slot pre-commit and integrity checks

Status: Accepted
Date: 2026-10-17

## Context

AOD 1.0 states its red lines in AGENTS.md, which is advisory. The AOD 2.0 research (§3.5, §5.3) asks for
deterministic enforcement and a test-integrity level in the review ladder. The dry run also showed a reviewer
subagent changing a slot's checkout. The plugin is installed per user, so every hook also runs in non-AOD projects.

## Decision

1. Plugin hooks (`hooks/hooks.json`), all Node scripts in `scripts/hooks/`, all silent (exit 0) unless the cwd is
   inside an initialised AOD repo, and all fail open on internal errors:
   - `SessionStart` (startup, resume, clear, compact): briefing with journal "Next step", open tasks, slots,
     running jobs and unlock state; after compaction it re-injects `context/invariants.md`.
   - `PreToolUse` Bash, git guard: blocks force-push and remote deletion, `reset --hard`, `rebase`, `clean -f`,
     branch deletion, discarding checkouts or restores, `stash drop/clear`, `update-ref -d` and history
     rewrites anywhere in the repo. Inside worktree slots it allows only read-only git.
   - `PreToolUse` Edit/Write/MultiEdit/NotebookEdit, contract guard: blocks edits to `protected` globs
     (`schemas/**`, `tests/acceptance/**`), accepted ADRs and any file in a slot, unless
     `aod unlock --reason ...` (time-boxed at most 4 h, logged to `.agents/tasks/jobs/unlocks.log`) is active.
   - `Stop`, done means green: opt-in (`stop_gate`). It runs the configured commands only when the main
     checkout has changes outside the ledger and journal, and honours `stop_hook_active` so it never loops.
2. Slot pre-commit scope guard: a per-worktree `core.hooksPath` (with `extensions.worktreeConfig`) pointing to
   `<git-common-dir>/aod-hooks/pre-commit`, which runs `aod scope check`. It applies only to slots and leaves the
   main checkout's hooks (husky etc.) alone. It is re-installed on every delegation so it follows plugin updates.
   AOD's own commit of implementer changes uses `--no-verify`, because the scope gate judges those files with
   a clearer report.
3. Integrity checks join the gates. **fail**: deleted or renamed test files, added skip/only/xfail markers, and
   production code that detects a test run. **warn** (shown to the reviewer): modified existing tests, changed
   tolerance values, and production comparisons against literals from the acceptance tests.
4. The ledger counts failed jobs (`failures`); at 2 the CLI recommends reject-and-split (methodology §9.3).

## Consequences

- Red lines that can be checked mechanically no longer depend on the model's compliance. The architect can still
  write contracts deliberately, but only through a visible, logged unlock.
- Bash-level writes (`echo > schemas/x`) bypass the contract guard; the scope gate and review still cover
  delegated work. A Bash write guard is deferred.
- The git guard is a parser, not a shell; exotic constructs (aliases, `eval`, scripts) are not seen.
- Mutation testing stays in M5.

## Alternatives considered

- Global `.git/hooks/pre-commit`: would also fire in the main checkout and conflict with existing hook managers.
- Making the Stop gate on by default: too surprising in projects without fast tests.
