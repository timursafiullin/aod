# AOD plugin — roadmap

## Context

`docs/aod-methodology.md` (AOD 1.0, RU) defines Architect-Orchestrated Development: a Product Owner, a strong
architect model (Claude Code) and cross-family implementers (Codex) working through contracts-first task
packets, isolated worktree slots, schema-bound reports, a ≤3-round review loop and repo-as-memory (`.agents/`).
`docs/aod-2.0-research.md` concludes the principles hold but the plumbing (Pi bridge, polling, hand-run
checklists) should become native primitives: **skills** for procedures, **hooks** for red lines,
**`codex exec --output-schema`** for delegation, fresh-context reviewers, a JSON task ledger, stop-clause +
test-integrity against reward hacking, and token-aware model routing.

Goal: ship AOD 2.0 as an **open-source Claude Code plugin** that anyone installs in one command and that works
"out of the box"; users never care what is inside. The repo currently contains only the two docs.

## Decisions (from user answers + rationale)

| Topic | Decision |
| --- | --- |
| Form | Claude Code plugin with marketplace manifest: `/plugin marketplace add timursafiullin/aod` → `/plugin install aod` |
| Targets | Architect = Claude Code; implementer = Codex CLI (via `codex exec`), with Codex-readable AGENTS.md block + implementer skill |
| Script runtime | **Node.js ≥ 18, zero npm dependencies** (`.mjs`, built-ins only). Reason: no install step, cross-platform incl. Windows, Codex/Claude users almost always have Node; avoids Python `python/py/venv` pain. `aod doctor` checks the environment |
| Split of work | Skills = judgment (short prompts); one CLI `scripts/aod.mjs` = mechanics (deterministic, zero tokens). Skills call the CLI |
| Repo language | English for everything shipped (methodology §14.4). RU methodology stays as source; EN translation in M6 |
| License | Apache-2.0 (patent grant; friendly for companies) — confirm at M0 |
| Dogfooding | This repo uses a light `.agents/` (context, decisions, journal, tasks) from M1 onward |

## Target repository layout

```text
aod/
├── .claude-plugin/{plugin.json, marketplace.json}
├── skills/                      # one folder per skill, SKILL.md + references/
│   ├── aod-init/                # bootstrap §20: scaffold .agents/, AGENTS.md, CLAUDE.md, config, slots
│   ├── aod-session-start/  aod-session-end/
│   ├── aod-spec/                # EARS requirements → spec S-xxxx
│   ├── aod-adr/                 # chat decision → ADR + index
│   ├── aod-packet/              # spec item → T-xxxx.md (scope, acceptance, budget)
│   ├── aod-preflight/           # §21.4 + cross-artifact consistency, tests fail for right reason
│   ├── aod-delegate/            # brief (+stop clause) → background `codex exec` in slot
│   ├── aod-verify/              # 4-level ladder: gates → integrity → fresh reviewer → escalate
│   ├── aod-close/               # squash merge + trailers, index.json, journal, slot reset
│   ├── aod-decision/            # PO decision-request format §14.3
│   └── aod-retro/               # metrics §18 from index.json + reports
├── agents/                      # subagents: aod-reviewer (Sonnet, fresh ctx), aod-explorer (Haiku, read-only)
├── hooks/hooks.json             # SessionStart briefing, git guard, contract guard, Stop green, compact refresh
├── scripts/
│   ├── aod.mjs                  # CLI entry: init|doctor|slot|packet|index|delegate|status|gates|scope|report|merge|metrics
│   ├── lib/                     # yaml-frontmatter, glob, minimal JSON-Schema validator, git, codex, config
│   └── hooks/*.mjs              # hook handlers (read stdin JSON, exit 2 to block)
├── templates/                   # .agents/ scaffold, AGENTS.md/CLAUDE.md, T-/S-/ADR/journal templates,
│                                #   report.schema.json (Codex-strict), index.schema.json, aod.config.json
├── codex/                       # implementer AGENTS.md block, implementer SKILL.md, custom-agent TOMLs
├── examples/toy-calculator/     # tiny repo used by e2e tests and the README demo
├── tests/                       # node:test unit + e2e (fake `codex` shim for CI)
├── docs/                        # methodology (RU source, EN later), guides, ADRs of the plugin itself
└── README.md LICENSE CONTRIBUTING.md CHANGELOG.md .github/workflows/ci.yml
```

User project after `/aod-init`: `.agents/{context,rules,decisions,specs,tasks,plans,playbooks→skills,journal}`,
`.agents/aod.config.json` (slots, codex model/effort per routing table, test/lint commands, shell),
`.agents/tasks/index.json` (source of truth) + generated `index.md`, slots under `../<repo>-worktrees/codex-N`.

## Key mechanics

- **Delegate**: `aod delegate T-0001` (run by the skill via Bash `run_in_background`) builds the brief from the
  packet, runs `codex exec --cd <slot> --model <cfg> --output-schema report.schema.json --json -o T-0001.report.json`,
  stores session id in `.agents/tasks/jobs/`. Harness notifies on exit → no polling. REVISE = `codex exec resume <id>`
  with revision brief §16.4. Budget timeout + "20 min no file changes" kill.
- **Verify ladder**: (1) `aod gates` — scope check vs packet globs, forbidden paths untouched, acceptance + package
  tests re-run, report schema valid; (2) integrity — diff of tests/acceptance, skip/xfail/only markers, loosened
  tolerances, hardcoded-expected heuristics, optional mutation adapter (Stryker/mutmut/Mull) on changed files;
  (3) `aod-reviewer` subagent with fresh context + review checklist + spec intent; (4) round >3 or contract
  dispute → `aod-decision`. Verdict + findings recorded in index.json.
- **Hooks**: git guard (block push --force, reset --hard, rebase, clean, branch -D in main checkout); contract guard
  (block Edit/Write on `schemas/**`, `tests/acceptance/**`, accepted ADRs unless `.agents/.unlock` set by
  aod-adr/aod-packet); Stop "done means green" (opt-in via config); SessionStart briefing (journal Next step, open
  tasks, slot states) and re-inject invariants after compaction. Scope guard also as git pre-commit in each slot.
- **Routing table** (research §5.1) lives in `aod.config.json`; skills set `model`/effort in front matter; heavy
  skills `disable-model-invocation: true` so they load only when invoked.

## Roadmap

| Milestone | Scope | Exit criteria |
| --- | --- | --- |
| **M0 Foundations** ✅ | plugin.json + marketplace.json, LICENSE, README stub, CI (node:test on win/mac/linux), `aod.mjs` skeleton, `aod doctor` (node, git, codex, versions, auth); ADR-0001 plugin architecture; smoke-check open uncertainties: current `codex exec` flags & `resume`, Codex skill path (`.agents/skills` vs `.codex/skills` collision with `.agents/`), hook event names | Plugin installs from local marketplace; `/aod-…` skills listed; `aod doctor` green; CI green on 3 OSes |
| **M1 Delegation loop MVP** ✅ (reviewer subagent + install test pending) | templates + `aod-init`; packet schema/validation; `index.json` + md render; slots (`aod slot create/reset/list`); `aod-packet`, minimal `aod-preflight`, `aod-delegate` (with stop clause), `aod-verify` levels 1+3, `aod-close`; Codex-strict report schema; fake-codex shim for tests | On `examples/toy-calculator`: init → packet → delegate to real Codex → verify → squash merge, end to end, without manual file editing; e2e test passes in CI with shim |
| **M2 Guardrails** (≈4 days) | All hooks; slot pre-commit scope guard; integrity checks (level 2) incl. test-edit/skip/tolerance detection; REVISE via `resume`, round limit 3; failure handling table §9.3 | Seeded "cheating" fixtures (edited test, skip, out-of-scope file, force-push) are all blocked/flagged |
| **M3 Memory & session** (≈4 days) | `aod-session-start/end`, `aod-adr`, `aod-spec` (EARS → acceptance mapping), `aod-decision`, journal tooling, compaction invariant refresh; full preflight consistency check | New session on toy repo resumes from journal "Next step" with zero manual reading; ADR from chat decision in 1 command |
| **M4 Cross-family & routing** (≈3 days) | `codex/` implementer pack (AGENTS.md block, implementer skill, custom-agent TOMLs Terra/Luna); optional integration with `openai/codex-plugin-cc` for reviewing Claude-written code; routing presets (Pro+Plus budget, API, Claude-only fallback where reviewer = fresh Claude subagent) | Claude-only and Claude+Codex modes both pass e2e; architect-written change gets Codex review |
| **M5 Parallelism & metrics** (≈4 days) | Waves: parallel delegation of independent tasks (depends_on + disjoint scope check), optional saved dynamic workflow; `aod-retro` metrics §18 + attention minutes + pool %; mutation adapters | Wave of 3 tasks on 2 slots completes; retro report generated from data |
| **M6 Community release v1.0** (≈1 week) | EN methodology + quick-start guide, 3-minute demo, CONTRIBUTING, issue templates, semver + CHANGELOG, release workflow, publish marketplace; collect feedback from 2–3 external users | Fresh machine: install → first delegated task in < 15 min following README |

Post-1.0 backlog: GitLab support, other implementers (Gemini CLI, Pi adapter), Codex-cloud mode when PC is off,
public-SDK leak guard, legacy-port playbook, `/skill-doctor` hygiene.

## Immediate next steps (M0, in this session after approval)

1. Create plugin manifests, LICENSE, README stub, `.gitignore`, CI workflow.
2. `scripts/aod.mjs` with `doctor` and `--version`; `tests/` with node:test.
3. Light `.agents/` for this repo + `ADR-0001-plugin-architecture.md` + `plans/roadmap.md` (this roadmap).
4. Spike: run `codex --version`, `codex exec --help` locally to pin flags; record findings in ADR/journal.
5. Commit on a branch `claude/m0-foundations` (not master).

## Verification

- Unit: `node --test tests/` (frontmatter parser, glob matcher, schema validator, scope check, index render).
- Hooks: feed recorded hook JSON payloads to `scripts/hooks/*.mjs`, assert exit codes/stdout.
- E2E: in CI with a fake `codex` shim producing commits + report; locally once per milestone with real Codex on
  `examples/toy-calculator`.
- Install test: `/plugin marketplace add ./` then `/plugin install aod`, run `/aod-init` in a temp repo.
