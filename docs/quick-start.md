# Quick start: first delegated task in 15 minutes

This guide takes you from nothing to one task implemented by Codex, checked by gates and a fresh-context
reviewer, and merged by Claude, using the tiny calculator in `examples/toy-calculator`.

## 1. Prerequisites (3 min)

| Tool | Check | Install |
| --- | --- | --- |
| Node.js 20+ | `node --version` | <https://nodejs.org> |
| git 2.38+ | `git --version` | <https://git-scm.com> |
| Claude Code | `claude --version` | <https://docs.claude.com/en/docs/claude-code> |
| Codex CLI | `codex --version` | `npm install -g @openai/codex` |
| Codex login | `codex login status` | `codex login` (ChatGPT plan) or `codex login --with-api-key` |

AOD itself has no dependencies to install. Unless Claude Code runs in auto mode, expect to approve a dozen or so
`node .../aod.mjs` and `git` commands on the way: the skills drive everything through that CLI.

## 2. Install the plugin (1 min)

In Claude Code:

```text
/plugin marketplace add timursafiullin/aod
/plugin install aod@aod
```

Start a new session, then run `/aod:doctor`. Every line should be `[ok  ]`, including `codex-login`, and it should end
with `mode: claude+codex` and "AOD environment is ready." A `[warn] codex-login` means step 6 would fail: run
`codex login` first.

## 3. Create a practice repository (1 min)

macOS, Linux, Git Bash or WSL:

```bash
git clone --depth 1 https://github.com/timursafiullin/aod aod-src
cp -r aod-src/examples/toy-calculator toy && cd toy
git init -b main && git add -A && git commit -m "initial: toy calculator"
claude
```

Windows PowerShell:

```powershell
git clone --depth 1 https://github.com/timursafiullin/aod aod-src
Copy-Item -Recurse aod-src/examples/toy-calculator toy; Set-Location toy
git init -b main; git add -A; git commit -m "initial: toy calculator"
claude
```

`src/index.mjs` re-exports `evaluate` from `./calc.mjs`, which does not exist yet. That is your first task.

## 4. Set up AOD in the repository (2 min)

```text
/aod:init
```

This scaffolds `.agents/` (project memory: context, decisions, specs, tasks, journal), `AGENTS.md`, `CLAUDE.md`,
`.agents/aod.config.json` and the task ledger. The skill then offers to fill in the vision, invariants, roadmap and
commands, and to set up session baseline checks and the stop gate. All of that is optional: for this guide, decline
and say *commit it*. Worktree slots for Codex are created later, next to the repository in `../toy-worktrees/`
(`aod status` shows them as `exists: false, free: true` until then).

## 5. Cut the first task (3 min)

Ask the architect:

> Create a task for Codex: implement `src/calc.mjs` exporting `evaluate(expr)` for `+ - * /` with integer
> operands and the usual precedence; throw `SyntaxError` on malformed input.

`/aod:packet` writes `T-0001.md` (scope `src/calc.mjs` plus its unit test, acceptance command) and an acceptance
test in `tests/acceptance/`, and commits both to `task/T-0001`. Your main checkout stays on `main`. If it asks for a
milestone, answer `M0`. Writing the acceptance test briefly unlocks the contract guard (`aod unlock`, then
`aod lock`); that is expected.

Then `/aod:preflight T-0001` checks the packet against the repository and confirms that the acceptance test
fails *for the right reason* (the module is missing, not a typo in the test), then marks the task `ready`.

`git status` on `main` now shows `.agents/tasks/index.json` and `index.md` as modified. That is the task ledger;
it stays uncommitted until the task is closed.

## 6. Delegate (3 min, mostly waiting)

```text
/aod:delegate T-0001
```

Codex runs in the background in slot `codex-1`, on branch `codex/T-0001`, with a brief built from the packet and a
JSON report schema. Claude is notified when it ends; you can keep talking to Claude meanwhile. A task this size
takes Codex about a minute and roughly 100k tokens on the default `max` preset, most of them cached input
(`aod route preset economy` spends less).

## 7. Verify and close (2 min)

`/aod:verify T-0001` runs the gates without spending model tokens:

- commits;
- scope and forbidden paths;
- deleted or skipped tests, and code that detects a test run;
- report schema;
- the acceptance re-run.

A fresh-context reviewer (a Claude subagent, so it uses some Claude tokens) then reads the diff against the packet and returns ACCEPT, REVISE (the same
Codex thread fixes it, at most 3 rounds) or REJECT.

On ACCEPT, `/aod:close T-0001` makes one squash commit on `main`. It holds:

- the code and its tests;
- the packet, the acceptance test and the Codex report;
- the ledger and the journal line;
- the trailers `Implemented-by: codex (<model>)` and `Reviewed-by: ...`.

The slot is reset for the next task. Nothing is pushed unless you ask. `git branch` still lists `task/T-0001`,
`codex/T-0001` and `slot/codex-1`: the first two are kept for reference (`aod merge --prune` deletes them), the
last is the slot's own branch.

## What next

- **Every session:** `/aod:session-start` restores state from the journal's *Next step*, and `/aod:session-end`
  writes it back.
- **Bigger features:** `/aod:spec` (EARS requirements traced to acceptance tests), then several packets. Record
  decisions with `/aod:adr`.
- **Throughput:** `/aod:wave` runs independent tasks with disjoint scopes in parallel slots.
- **Cost:** `aod route preset max|balanced|economy` picks models per role (implement, escalate, explore).
  `/aod:retro` shows first-pass acceptance, rounds, tokens and the attention you spent.
- **Code Claude writes itself:** `/aod:cross-review` has Codex review it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `aod: ... exit 5` / "Codex is unavailable or out of quota" | AOD stops and asks instead of falling back. Wait for the quota window, `codex login`, or `aod route preset economy` |
| Codex not found on Windows | Set `codex.command` in `.agents/aod.config.json` to the full path of `codex.exe`, or set `AOD_CODEX_CMD` to a JSON array such as `["C:/path/codex.exe"]` |
| `task/T-xxxx predates these files` | You committed a spec or ADR after the task branch; run `aod task sync T-xxxx` |
| An edit to `tests/acceptance/**` is blocked | The contract guard is working. If the change is intended: `aod unlock --reason "..."` |
| Gates fail on `scope` | The implementer touched files outside the packet. REVISE, or widen the scope in the packet if it was too narrow |

The CLI behind every skill is `node <plugin>/scripts/aod.mjs`. Run it with `help` for all commands and exit codes.
