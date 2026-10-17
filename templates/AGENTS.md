# {project}

<!-- aod:begin -->
## How this repository is worked on (AOD)

This repository uses Architect-Orchestrated Development. An architect agent owns decisions, contracts and
acceptance tests; implementer agents each work on exactly one task packet inside an isolated worktree slot.

### Read before working

| Task type | Read first |
| --- | --- |
| Any task | this file, `.agents/context/invariants.md`, your task packet `.agents/tasks/T-xxxx.md` |
| Implementation | the contracts and ADRs listed in the packet, `.agents/rules/` for the language |
| Review | `.agents/rules/review-checklist.md`, the spec referenced by the packet |

### Repository map

| Path | Purpose | Owner |
| --- | --- | --- |
| `.agents/` | Project memory: context, decisions, specs, tasks, plans, journal | architect |
| `schemas/` | Contracts, single source of truth | architect |
| `tests/acceptance/` | Acceptance tests, written before implementation | architect |
| everything else | Code and unit tests | as assigned by the task packet `scope` |

### Commands

<!-- Fill in: install, format, lint, typecheck, test. Target shell: bash. -->

### Definition of Done

- All acceptance commands of the packet pass; unit tests of touched packages pass.
- Every changed path is inside the packet `scope`.
- Docs are updated in the same change when behaviour changes.

### Never

- Edit contracts (`schemas/**`), acceptance tests (`tests/acceptance/**`) or accepted ADRs unless you are the architect.
- Skip, special-case or weaken a test or tolerance to make it pass. If a test looks wrong, stop and report `blocked`.
- Push, force-push, rebase, reset --hard, clean, switch branches or delete branches.
- Add a dependency without an ADR. Commit secrets or build artefacts.
- Put links to AI sessions or chats in commits, PRs or tags.

### Language

Everything written in the repository is in English.
<!-- aod:end -->
