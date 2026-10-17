# ADR-0004: Memory and session tooling: EARS specs, ADR lifecycle, journal, deterministic preflight

Status: Accepted
Date: 2026-10-17

## Context

Methodology §6.3 and §12 make the repository the project's only memory: ADRs, specs, journal, session protocol.
AOD 2.0 research §3.1 recommends EARS requirements (one sentence maps to one acceptance test) and a
cross-artifact consistency check before delegation, and §3.2 recommends machine-checkable progress state.
In M1 these steps were prose checklists the model had to follow from memory.

## Decision

1. Skills `session-start`, `session-end`, `adr`, `spec`, `decision` carry the judgment. The deterministic parts are
   CLI commands:
   - `aod session start`: state from the repo plus baseline commands (`session.baseline`); exits 1 when the
     baseline is red.
   - `aod session end [--commit]`: journal complete, no running jobs, no active unlock, and only `.agents/` memory
     uncommitted. With `--commit`, it commits those memory files as `docs: session journal <date>`.
   - `aod journal new|check`: one entry per day (reused), required sections, non-empty Done and Next step.
   - `aod adr new|accept|supersede`: numbering, index rows and status changes. Accept refuses empty
     Context/Decision/Consequences; supersede never edits the old ADR's substance.
   - `aod spec new|check`: EARS lint (5 patterns, one "shall", vague words) and `Acceptance:` tracing per
     requirement.
2. `aod preflight T-xxxx` automates methodology §21.4. It checks the packet and branch, `depends_on`, contracts
   (files exist on the task branch, ADRs are Accepted), the spec (lint, requirement ids named in the packet),
   new acceptance tests, scope overlap with active tasks and brief size. It then runs the acceptance commands on
   a checkout of `task/T-xxxx` (a free slot, which keeps its build caches, or else a temporary worktree). They
   must fail, and a heuristic classifies the reason. Semantic consistency between documents stays a model
   judgment in the skill.
3. Decision requests to the PO use the §14.3 format, and the answer is recorded at once (ADR, packet or journal).

## Consequences

- A new session can resume from `aod session start` alone; ending a session leaves a clean tree.
- The failure-reason heuristic knows Node and Python messages; other stacks fall back to "fails, check the tail".
- Spec status (draft/approved) is advisory; PO approval is a convention, not enforced.

## Alternatives considered

- Adopting GitHub Spec Kit or Kiro wholesale: rejected in the AOD 2.0 research (no verification loop, lock-in).
- Storing the journal as JSON: Markdown stays human-first; the CLI checks its structure instead.
