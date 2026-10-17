# AOD — Architect-Orchestrated Development

> Status: early development (M1, delegation loop). Expect breaking changes. See the [roadmap](.agents/plans/roadmap.md).

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
and run `codex login`. Check everything with `/aod-doctor`.

## The loop

| Step | Skill | What happens |
| --- | --- | --- |
| 0 | `/aod-init` | Scaffolds `.agents/`, `AGENTS.md`, `CLAUDE.md`, config, task ledger and worktree slots |
| 1 | `/aod-packet` | Task packet `T-xxxx.md` (scope globs, acceptance commands) + acceptance tests on `task/T-xxxx` |
| 2 | `/aod-preflight` | Packet, contracts and tests are consistent; tests fail for the expected reason |
| 3 | `/aod-delegate` | `codex exec` in a slot, in the background, with a schema-enforced JSON report |
| 4 | `/aod-verify` | Gates (scope, skip markers, report, acceptance re-run), then a fresh-context reviewer |
| 5 | `/aod-close` | Squash merge with `Implemented-by` / `Reviewed-by` trailers, ledger update, slot reset |

Revisions resume the same Codex thread (max 3 rounds, then escalate to you). Try it on
[examples/toy-calculator](examples/toy-calculator).

All mechanics live in a zero-dependency CLI that the skills call; you can also use it directly:

```bash
node scripts/aod.mjs help
```

## Documentation

- [Methodology (AOD 1.0, Russian)](docs/aod-methodology.md)
- [AOD 2.0 research and upgrade plan](docs/aod-2.0-research.md)
- [Architecture decisions](.agents/decisions/index.md)

## Development

```bash
node --test
```

The end-to-end tests run the full loop against a fake Codex (`tests/fixtures/fake-codex.mjs`).

## License

[Apache-2.0](LICENSE)
