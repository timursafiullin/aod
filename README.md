# AOD — Architect-Orchestrated Development

> Status: release candidate for 1.0. The delegation loop, guardrails, memory, routing, waves and retro are complete
> and tested on Windows, macOS and Linux. See the [changelog](CHANGELOG.md) and the [roadmap](.agents/plans/roadmap.md).

AOD is a Claude Code plugin that turns one strong model into an **architect** and cheaper, cross-family
coding agents (Codex CLI) into **implementers**. The architect writes contracts and acceptance tests, cuts work
into small task packets, delegates each to an isolated git worktree, verifies the result with deterministic
gates and a fresh-context reviewer, and is the only one who merges. Everything the team knows lives in the
repository (`.agents/`), so no session starts from zero.

## Install

```text
/plugin marketplace add timursafiullin/aod
/plugin install aod@aod
```

Requirements: Node.js >= 20 and git >= 2.38. For delegation, install [Codex CLI](https://github.com/openai/codex)
and run `codex login`. Check everything with `/aod:doctor`.

Want to see it first? From a clone of this repository, `node scripts/dev/demo.mjs` runs the whole loop in a
throwaway repo in a few seconds, with a simulated Codex: packet, preflight, delegation, a gate catching an
out-of-scope edit, a revision round, the squash merge and the retro. Add `--slow` to record it.

New here? The [quick start](docs/quick-start.md) takes you from install to a first task implemented by Codex and
merged by Claude in about 15 minutes.

## The loop

| Step | Skill | What happens |
| --- | --- | --- |
| 0 | `/aod:init` | Scaffolds `.agents/`, `AGENTS.md`, `CLAUDE.md`, config and the task ledger |
| 1 | `/aod:packet` | Task packet `T-xxxx.md` (scope globs, acceptance commands) + acceptance tests on `task/T-xxxx` |
| 2 | `/aod:preflight` | Packet, contracts and tests are consistent; tests fail for the expected reason |
| 3 | `/aod:delegate` | `codex exec` in a slot, in the background, with a schema-enforced JSON report |
| 4 | `/aod:verify` | Gates (scope, skip markers, report, acceptance re-run), then a fresh-context reviewer |
| 5 | `/aod:close` | One squash commit (code, report, ledger, journal) with `Implemented-by` / `Reviewed-by` trailers; slot reset |

Around the loop, project memory keeps every session from starting at zero:

| Skill | What happens |
| --- | --- |
| `/aod:session-start` | Journal *Next step*, open tasks, slots, running jobs and baseline checks |
| `/aod:spec` | Feature spec `S-xxxx` with EARS requirements, each traced to an acceptance test |
| `/aod:adr` | Decision recorded as `ADR-xxxx`; accept or supersede |
| `/aod:decision` | Decision request to you: context, options, recommendation, what happens without an answer |
| `/aod:session-end` | Journal entry checked, memory committed, clean tree for the next session |

Cross-family tools and routing:

| Skill / command | What happens |
| --- | --- |
| `/aod:cross-review` (`aod review`) | Codex reviews code Claude wrote itself (`codex exec review`) |
| `/aod:explore` (`aod explore`) | Read-only Codex research answering with `path:line` citations, instead of filling Claude's context |
| `aod route show` / `aod route preset max\|balanced\|economy` | Models per role: implement, escalate (after a failure or from review round 2), explore |

Throughput and feedback:

| Skill / command | What happens |
| --- | --- |
| `/aod:wave` (`aod wave plan\|run`) | Independent ready tasks (dependencies done, disjoint scopes) run in parallel, one per slot |
| `/aod:retro` (`aod retro`) | Loop metrics from the ledger: first-pass acceptance, rounds, blocked/escalation rates, scope violations, attention minutes, tokens |
| `mutation` in `aod.config.json` | Optional mutation-testing gate (Stryker, PIT, cargo-mutants, mutmut, Mull, ...) on the changed files |

When Codex is unavailable or out of quota, AOD stops with exit code 5 and asks you; it never falls back silently.

Revisions resume the same Codex thread (max 3 rounds, then escalate to you). Try it on
[examples/toy-calculator](examples/toy-calculator).

## Guardrails

Hooks enforce the red lines deterministically, but only inside repositories where AOD is initialised:

| Hook | Enforces |
| --- | --- |
| SessionStart | Briefing from the journal's *Next step*, open tasks and slots; invariants re-injected after compaction |
| Bash guard | No force-push, `reset --hard`, rebase, `clean -f`, branch deletion or discarding checkouts; read-only git inside slots; no shell writes to protected paths |
| Contract guard | Contracts, acceptance tests, accepted ADRs and slots are not edited unless `aod unlock --reason ...` is active |
| Stop (opt-in) | "Done means green": a turn cannot end with changes while the configured checks fail |
| Slot pre-commit | Commits on `codex/T-xxxx` must stay inside the packet scope |

Gates add integrity checks: deleted tests, skip markers and test-run detection fail; modified tests, changed
tolerances and special-cased acceptance literals are flagged for the reviewer.

All mechanics live in a zero-dependency CLI that the skills call; you can also use it directly:

```bash
node scripts/aod.mjs help
```

## Documentation

- [Methodology (AOD 2.0, English)](docs/aod-methodology-EN.md)
- [Methodology (AOD 2.0, Russian)](docs/aod-methodology-RU.md)
- [AOD 2.0 research and upgrade plan](docs/aod-2.0-research.md)
- [Architecture decisions](.agents/decisions/index.md)

## Development

```bash
node --test
```

The end-to-end tests run the full loop against a fake Codex (`tests/fixtures/fake-codex.mjs`). See
[CONTRIBUTING](CONTRIBUTING.md) for the ground rules and the release process, and [SECURITY](SECURITY.md) for
reporting guardrail bypasses.

## License

[Apache-2.0](LICENSE)
