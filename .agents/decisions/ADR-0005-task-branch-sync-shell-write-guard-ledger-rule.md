# ADR-0005: Task branches carry committed specs/ADRs, shell writes are guarded, one ledger rule

Status: Accepted
Date: 2026-10-17

## Context

The M3 dry run on aod-toy2 showed three gaps:

1. `aod adr new` and `aod spec new` leave files uncommitted on the base branch, and `aod task commit` builds
   `task/T-xxxx` from the base branch's last commit. Preflight then failed with "ADR/spec not found", and nothing
   brought a task branch up to date.
2. Shell writes (`echo > tests/acceptance/x`) got past the contract guard. ADR-0003 had listed this as a known gap.
3. The skills disagreed on when the task ledger is committed.

## Decision

1. `aod task commit` refuses while the packet's spec or contracts (ADR files included) are uncommitted or
   modified on the base branch, and while an existing task branch predates them. `aod task sync T-xxxx` merges
   the base branch into `task/T-xxxx` with plumbing (merge-tree, commit-tree, update-ref) and no checkout. It
   refuses once the task is delegated, unless `--force` is given.
2. The Bash hook (`bash-guard`, formerly `git-guard`) also applies the contract guard to shell writes:
   redirections, `tee`, `cp`/`install`/`ln` destinations, `mv` and `rm` paths, `touch`/`truncate`/`shred`,
   `sed -i`/`perl -i`, `dd of=` and `git rm`/`git mv`, following `cd`. This amends ADR-0003's consequence that
   Bash writes were unguarded. Interpreters writing files (`node -e`, scripts) remain out of reach.
3. Ledger rule, stated identically in the packet, close and session-end skills: `index.json` and `index.md` may
   stay uncommitted on the base branch. They are committed by `aod merge` or `aod session end --commit`,
   whichever comes first, and never on a task branch.

## Consequences

- Preflight's "not found on task branch" failures now point to `aod task sync`.
- Packets with template placeholders (`<...>`) in `scope` or `acceptance` fail validation.
- `aod session end` without `--commit` returns `status: pending-commit` with exit 0.

## Alternatives considered

- Auto-syncing on every `task commit`: silent merges into task branches; explicit sync is easier to reason about.
- Committing specs and ADRs automatically inside `adr new` and `spec new`: they are drafts at that point.
