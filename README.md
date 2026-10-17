# AOD — Architect-Orchestrated Development

> Status: early development (M0). Not ready for use yet. See the [roadmap](.agents/plans/roadmap.md).

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

Then run `/aod-doctor` to check your environment. Requirements: Node.js >= 20 and git. Codex CLI is optional;
without it AOD runs in Claude-only mode.

## Documentation

- [Methodology (AOD 1.0, Russian)](docs/aod-methodology.md)
- [AOD 2.0 research and upgrade plan](docs/aod-2.0-research.md)
- [Architecture decisions](.agents/decisions/index.md)

## Development

```bash
node --test
```

## License

[Apache-2.0](LICENSE)
