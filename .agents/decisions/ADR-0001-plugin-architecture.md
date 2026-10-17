# ADR-0001: Ship AOD as a zero-dependency Claude Code plugin

Status: Accepted
Date: 2026-10-17

## Context

AOD 1.0 (then `docs/aod-methodology.md`; now `docs/aod-methodology-EN.md` and `-RU.md`, updated to 2.0) relies on hand-built plumbing: a Pi MCP bridge, manual polling, prose
checklists. The AOD 2.0 research (`docs/aod-2.0-research.md`) shows these now map to native primitives:
skills, hooks, subagents and `codex exec --output-schema`. The project is meant to be open source and usable
by people who do not care how it works inside: install must be one step and must work on Windows, macOS and Linux.

## Decision

1. Distribute AOD as a Claude Code plugin; the repository root is both the plugin and its marketplace
   (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`).
2. Procedures are skills (`skills/aod-*`); red lines are hooks; the reviewer and explorer are subagents.
3. All mechanics live in one CLI, `scripts/aod.mjs`, written for Node.js >= 20 with **no npm dependencies**
   (built-in modules only). Skills call the CLI; the CLI never calls a model.
4. Implementer = Codex CLI via `codex exec`. When Codex is absent, AOD runs in `claude-only` mode with
   fresh-context Claude subagents as implementers and reviewers.
5. License: Apache-2.0. Everything shipped is in English.

## Consequences

- No install step beyond the plugin itself; `aod doctor` reports missing tools with a fix hint.
- Small helpers that a library would normally provide (YAML front matter, globbing, JSON Schema subset) must be
  written and tested in `scripts/lib/`.
- Node < 20 is unsupported (Node 18 is end-of-life).

## Alternatives considered

- Python scripts: richer libraries, but interpreter discovery (`python`/`py`/venv) is a common failure on Windows.
- Single umbrella skill without hooks: simpler, but red lines stay advisory, contradicting AOD 2.0 §5.3.
- Bash + PowerShell: no runtime, but every script twice.

## Open items (verify in M0/M1)

- Resolved by ADR-0002: `codex exec` flags pinned against codex-cli 0.163.0.
- Resolved by ADR-0006: Codex loads `.agents/skills/` and `.codex/skills/`.
