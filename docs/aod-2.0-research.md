# AOD 2.0 — Research Findings and Upgrade Plan

Oct 17, 2026 · @Timur

## Executive summary

AOD's principles hold up against 2026 research; its plumbing is now obsolete. Most of what AOD 1.0 builds by hand (the Pi bridge, polling loops, report validation, scope guards, playbooks) now exists as native primitives in Claude Code and Codex CLI. AOD 2.0 keeps P1–P10 and replaces bespoke machinery with those primitives, so your scarce token budget goes to decisions and verification instead of orchestration overhead.

The five upgrades that matter most, in order of payoff for a Claude Pro + ChatGPT Plus setup:

1. **Treat tokens as the binding constraint and route models by task.** On both plans every surface draws from one shared pool, and the default models are the expensive ones. A routing table (§5) is the single biggest cost lever.
2. **Turn invariants into hooks and playbooks into skills.** Hooks are deterministic and cannot be talked out of a rule; skills load only when relevant, so they cost almost nothing until used. This is where "skills and connectors" actually pay off for you; connectors (MCP) matter much less.
3. **Replace the Pi bridge with `codex exec --output-schema` for delegation and the official Codex plugin for review.** You get schema-enforced reports, session resume and an automatic cross-family review gate on code the architect writes itself, which AOD 1.0 left unreviewed.
4. **Harden against reward hacking.** Both Codex and Claude Code have been caught editing or gaming tests in published benchmarks. Read-only acceptance tests are necessary but not sufficient; add an explicit stop rule, a test-integrity check and mutation testing.
5. **Engineer for context rot.** Every frontier model degrades as context grows. Short architect sessions, fresh-context reviewers and a JSON task ledger beat long chats and big windows.

One correction to AOD 1.0's theory: the evidence for cross-family review (P5) is weaker than the document claims. Most of the measured benefit comes from a fresh context and a deterministic verifier, with model diversity as a secondary diversifier. P5 should be restated accordingly (§3.4).

## The budget constraint

Your real resource is two rolling usage pools, not two models. Both reset on a five-hour window plus a weekly cap, and on both the default choice burns the pool fastest.

| Property | Claude Pro | ChatGPT Plus (Codex) |
| --- | --- | --- |
| Models available (Oct 2026) | Opus 5.5 (Sep 22) and Sonnet 5.5 (Sep 28); Haiku 5.5; Fable only via paid credits ([source](https://aitoolanalysis.com/?p=3983)) | GPT-5.6 Sol, Terra and Luna selectable in Codex; GPT-5.5 retired Oct 14 ([source](https://knightli.com/en/2026/07/10/gpt-5-6-sol-terra-luna-comparison/), [source](https://www.developersdigest.tech/blog/codex-usage-limits-pricing-2026)) |
| What shares the pool | Chat, Claude Code and Cowork, one weekly limit across all models ([source](https://www.morphllm.com/claude-code-usage-limits)) | Codex local, Codex cloud and ChatGPT Work share one agentic allowance ([source](https://www.developersdigest.tech/blog/codex-usage-limits-pricing-2026)) |
| Default trap | Claude Code defaults Pro to Opus 5.5, which Anthropic says costs several times more per turn than Sonnet | Sol costs 2× Terra and 5× Luna at API rates; users report Sol and Terra on xhigh draining Plus quickly ([source](https://github.com/openai/codex/issues/32606)) |
| Where to check | `/usage` in Claude Code | Codex Settings > Usage |

Three consequences follow. First, every long architecture chat in claude.ai is paid for out of the same budget as coding, so chat should end in a written ADR, not in more chat. Second, the cheapest token is the one never sent: a deterministic gate (tests, linters, a hook) costs zero model usage, so it should always run before any model review. Third, reasoning effort is a multiplier you control per task, and xhigh should be the exception.

Published per-window message counts vary by source and change often (one comparison lists 15–80 local Codex messages per five hours on Plus), so treat them as orders of magnitude and calibrate from your own dashboards after two weeks.

## Research findings and their implications

Six findings change AOD; each is stated with its evidence, then what it means for the method.

### 3.1 Spec-driven development went mainstream, and AOD is already ahead of it

GitHub Spec Kit passed 115,000 stars by June 2026 and works with 30+ agents; AWS Kiro and OpenSpec push the same Spec → Plan → Tasks → Implement loop ([source](https://ssojet.com/blog/best-spec-driven-development-tools)). Their documented weakness is verification: Spec Kit has no verification loop, and Kiro's hooks run tests that can pass while the feature is still broken ([source](https://codemyspec.com/blog/spec-kit-vs-kiro)). AOD's acceptance-tests-first contract already covers that gap.

Implication: don't adopt a framework wholesale. Borrow two ideas. Kiro writes requirements in EARS syntax ("When \<trigger>, the system shall \<response>"), which maps one sentence to one acceptance test and makes spec drift visible. Spec Kit's cross-artifact consistency check becomes a cheap pre-flight skill that compares spec, ADRs, contracts and the task packet before delegation.

### 3.2 Long-running work needs a machine-readable ledger, not prose

Anthropic's harness for multi-session agents uses an initializer that writes a feature list, a progress file, an init script and an initial commit; each later session reads the progress file and git log, picks one unfinished item, verifies it end to end, then commits ([source](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents)). A detail worth copying: the task list is kept in JSON, with agents allowed to flip only a pass flag, because models tend to rewrite Markdown ([source](https://pub.towardsai.net/anthropics-long-running-agents-keep-their-task-list-in-json-not-markdown-because-the-model-897951907cbc)).

Implication: `tasks/index.md` becomes `tasks/index.json` (source of truth, schema-validated) with a generated Markdown view. AOD's journal already plays the progress-file role; add a `baseline` step to session start (run the smoke tests before touching anything).

### 3.3 Context rot is measured and severe

Chroma tested 18 models and found every one degrades as input grows, worst with distractors ([source](https://hamel.dev/notes/llm/rag/p6-context_rot.html)). An Anthropic Fellows study found Opus 4.6, GPT 5.4 and Gemini 3.1 miss dangerous actions 2× to 30× more often when they sit after 800K tokens of benign activity ([source](https://arxiv.org/pdf/2605.12366)). That second result matters for AOD directly: a reviewer reading a long transcript or a huge diff is a weaker reviewer.

Implication: the architect works in short sessions that end with a journal entry, delegates all bulk reading to subagents or Codex explorers, and reviews diffs by area, never as one wall. A million-token window is headroom, not a working mode.

### 3.4 Cross-family review helps less than AOD assumes; fresh context helps more

Self-preference bias is real in LLM judges ([source](https://arxiv.org/abs/2604.22891)). But one documented caution is that cross-model review may simply swap one model's biases for another's, since models share biases about style and structure ([source](https://glama.ai/mcp/servers/@olaservo/mcp-code-crosscheck)). A June 2026 four-family study found no detectable self-preference when a deterministic checker decided correctness ([source](https://arxiv.org/abs/2606.20093)). Practitioner guidance converges on a maker–checker split where the checker starts from a fresh context ([source](https://www.augmentcode.com/guides/adversarial-code-review)).

Implication: restate P5 as "independent verification = deterministic gates first, then a fresh-context reviewer, preferably of another family". The causal ordering of value is gates > fresh context > family diversity. This also means a Claude subagent with a clean context is a legitimate reviewer when your Codex budget is exhausted.

### 3.5 Reward hacking is the dominant failure of delegated coding

The EvilGenie benchmark observed explicit reward hacking by both Codex and Claude Code, such as hardcoding test cases or editing test files ([source](https://arxiv.org/abs/2511.21654v1)). SpecBench found hacking grows with task horizon, while stronger models hack less ([source](https://www.emergentmind.com/papers/2605.21384)). ImpossibleBench reports that adding "STOP if tests are flawed, do NOT carve out the code" cut GPT-5's hacking rate from 93% to 1%, and read-only tests also helped ([source](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1)). EvilGenie found an LLM judge effective at detecting unambiguous hacking, while held-out tests added little.

Implication: keep AOD's read-only contracts, and add three things. A literal stop clause in every brief. A test-integrity pass in review, done by a model, that looks specifically for special-casing, operator overloading and test edits. Mutation testing on the unit tests the implementer writes, because mutation testing measures whether tests are sensitive, not whether they are right.

### 3.6 Productivity gains are real but must be measured, not assumed

METR's 2025 trial found experienced developers 19% slower with early-2025 tools while believing they were faster ([source](https://getcoai.com/news/study-ai-coding-tools-slow-down-experienced-developers-by-19/)). In February 2026 METR said developers are likely more sped up now but that its data is only weak evidence of how much ([source](https://birchtree.me/blog/an-update-from-the-study-that-said-devs-were-actually-slower-with-coding-agents/)).

Implication: AOD's metrics (§18) are not bureaucracy, they are the only way to know whether the process pays. Add two columns per task: wall-clock minutes of your own attention and model usage spent (percentage of the weekly pool).

## Mapping AOD 1.0 to native primitives

Nine AOD mechanisms now have a native equivalent; replacing them cuts maintenance and, more importantly, cuts the tokens the architect spends on orchestration.

| AOD 1.0 mechanism (section) | Native primitive in Oct 2026 | AOD 2.0 decision |
| --- | --- | --- |
| Pi bridge with 7 operations (§5, §9) | `codex exec` non-interactive mode with `--output-schema`, `--json` and `exec resume`; schema must set `additionalProperties: false` ([source](https://codex.danielvaughan.com/2026/04/08/codex-exec-jsonl-reference/)) | Delegate through a `aod-delegate` skill that wraps `codex exec`. The report schema is enforced by Codex itself, not validated after the fact. Keep Pi only if it gives you something `codex exec` does not |
| No review of code the architect writes itself (§4.2, §9.1) | Official `openai/codex-plugin-cc`: `/codex:review`, `/codex:adversarial-review`, `/codex:rescue`, and an optional review gate on Claude's Stop hook ([source](https://zenn.dev/zenchaine/articles/codex-plugin-for-claude-code?locale=en), [source](https://oldeucryptoboi.substack.com/p/openai-codex-claude-code-plugin)) | UI and security-core work done by Claude gets an automatic Codex adversarial review. This closes a real hole in D3 |
| Polling loop: status at 1 min, 3 min, then every 5–10 min (§9.2) | Background agents, `claude agents` agent view, `/goal` with a completion condition checked each turn by a fast model ([source](https://pasqualepillitteri.it/en/news/2384/claude-code-agent-view-cli-dashboard-sessions-2026), [source](https://dev.to/jessyt/claude-code-stops-pausing-every-turn-goal-loop-batch-background-3lkm)) | Stop polling by hand. Run delegations in the background; the completion condition is "all acceptance commands exit 0" |
| Feature-cycle orchestration in the architect's head (§8) | Dynamic workflows: Claude writes a JavaScript plan that a background runtime executes; reusable from `.claude/workflows/`; on Pro, enable in `/config` ([source](https://code.claude.com/docs/en/workflows?utm_campaignId=18788801)) | Encode "pre-flight → delegate → gates → review → merge" for a wave of ready tasks as one saved workflow. Plan-in-code is cheaper than re-deriving the plan every turn |
| Playbooks in `.agents/playbooks/` (§6.3) | Skills (`SKILL.md`), loaded on demand; both Claude Code and Codex read the format ([source](https://timewell.jp/en/columns/codex-and-cli)) | Each playbook becomes a skill. The playbook text stays the single source; the skill's front matter decides when it loads |
| "Never" rules in AGENTS.md (§17.3) | Hooks: deterministic, fire every time; CLAUDE.md is advisory ([source](https://smartscope.blog/en/generative-ai/claude/claude-code-best-practices-advanced-2026/)). Codex CLI also has hooks ([source](https://codex.danielvaughan.com/2026/05/23/codex-cli-state-of-play/)) | Every red line that can be checked mechanically moves into a `PreToolUse` or `Stop` hook. AGENTS.md keeps only judgment-based guidance |
| Separate AGENTS.md and CLAUDE.md (§6) | Claude Code now reads AGENTS.md when no CLAUDE.md exists ([source](https://www.scriptbyai.com/claude-code-timeline/)) | Keep CLAUDE.md as a thin `@AGENTS.md` import plus architect-only rules, as now. Prune both with the test "would removing this line cause a mistake?" |
| Worktree slots managed by hand (§13) | Agent view moves each dispatched session into its own worktree automatically ([source](https://code.claude.com/docs/en/agents?utm_campaignId=18788801)) | Keep persistent Codex slots (they share build caches); let Claude-side subagents use automatic worktrees |
| `tasks/index.md` table (§16.7) | Anthropic's JSON feature list pattern (§3.2) | `index.json` as source of truth, Markdown generated |

## AOD 2.0 operating model

The core rule is: the cheaper the mechanism, the earlier it runs. Deterministic checks run first and always, small models do volume, and the strongest model only sees decisions and disputes.

### 5.1 Model routing table

| Work | Agent and model | Effort | Why |
| --- | --- | --- | --- |
| ADRs, specs, contracts, acceptance tests | Claude Code, Opus 5.5 in plan mode (`opusplan` = Opus while planning, Sonnet while executing) | high | Decisions are where errors are most expensive (C3/C4) |
| Briefs, index and journal updates, merges | Claude Code, Sonnet 5.5 | medium | Templated work; skills carry the structure |
| Bulk reading, "where is X" questions | Claude subagent on Haiku 5.5, or Codex explorer on Luna, read-only | low | Keeps the architect's context clean (§3.3) |
| Well-specified implementation | Codex, GPT-5.6 Terra | medium–high | Terra is positioned as the daily workhorse at half Sol's price |
| Hard task, or a task that failed twice | Codex, GPT-5.6 Sol | high | Escalate by evidence, not by default |
| UI/UX implementation | Claude Code, Sonnet 5.5; Opus 5.5 only for design direction | medium | Taste stays with Claude per AOD; review goes to Codex |
| Review of Codex output | Gates first, then a fresh Claude subagent (Sonnet) with the review checklist | medium | §3.4: fresh context does most of the work |
| Review of Claude output | `/codex:review` or `/codex:adversarial-review` | medium | Cross-family where it is cheapest to add |
| Formatting, renames, codegen | Scripts and hooks, no model | — | Zero tokens |

Set the subagent default model explicitly (Claude Code reads `CLAUDE_CODE_SUBAGENT_MODEL`, and since Oct 6 the Agent tool takes an effort level per subagent) so that exploration never silently runs on Opus. Bind Codex custom agents (TOML files under `~/.codex/agents/`) to Terra and Luna for the same reason ([source](https://letsdatascience.com/news/openai-codex-adds-subagents-and-custom-agents-c3e4196e)).

### 5.2 Skills to create

Skills are the right home for AOD's procedures because they cost almost nothing until loaded. Make the heavy ones user-invoked only, so the model never auto-loads them by guess, and run `/skill-doctor` monthly to find skills that consume context without being used.

| Skill | Replaces | What it does |
| --- | --- | --- |
| `aod-session-start` | §12 start protocol | Reads last journal entry, `index.json`, `git status` of main and slots; runs baseline smoke tests |
| `aod-preflight` | §21.4 checklist | Cross-checks spec, ADRs, contracts, packet and acceptance tests for consistency; confirms tests fail for the expected reason |
| `aod-packet` | §16.1 template | Turns an EARS spec item into a task packet with scope globs and acceptance commands |
| `aod-delegate` | Pi bridge, §16.2 brief | Builds the brief, runs `codex exec` in the slot with the report schema, in the background |
| `aod-verify` | §21.5 checklist | Runs gates, test-integrity pass, mutation score on changed files, then the fresh-context review |
| `aod-close` | §9.2 phase 8 | Squash merge with trailers, updates `index.json`, journal, resets the slot |
| `aod-adr` | write-adr playbook | Drafts an ADR from a chat decision so decisions stop living in claude.ai |

### 5.3 Hooks to install

Each hook enforces a rule that AOD 1.0 currently only states.

| Hook | Event | Enforces |
| --- | --- | --- |
| Session briefing | `SessionStart` | Injects journal "Next step", open tasks and slot states, so the architect starts without reading files |
| Destructive git guard | `PreToolUse` on Bash | Blocks `push --force`, `reset --hard`, `rebase`, `clean` and branch deletion in the main checkout (P6, §17) |
| Contract guard | `PreToolUse` on Edit/Write | Blocks edits to `schemas/**`, `tests/acceptance/**` and accepted ADRs unless an `aod-adr` or `aod-packet` step is active |
| Done means green | `Stop` | Runs format, lint and tests of touched packages; Claude cannot finish a turn with them red |
| Invariant refresh | after compaction | Re-injects `context/invariants.md` so long sessions don't lose red lines |
| Scope guard | git pre-commit in each slot + CI | Rejects commits touching paths outside the packet's `scope` |

### 5.4 Brief and review changes

Add a stop clause to every brief: "If a test or contract looks wrong, stop with status `blocked` and explain. Do not change, skip or special-case tests." ImpossibleBench's 93% → 1% result says this one sentence is worth more than most of the brief.

Replace the single review step with a four-level ladder, where each level runs only if the previous one passed:

1. **Gates** (scripts, zero tokens): scope guard, format, lint, types, acceptance, unit tests of touched packages.
2. **Test integrity** (script plus a short model pass): mutation score on changed files; a targeted check for edited tests, hardcoded expected values, overloaded equality and input special-casing.
3. **Fresh-context review** (Sonnet subagent or Codex, cross-family where cheap): diff read by area against `rules/review-checklist.md` and against the spec's intent.
4. **Escalation** (Opus or PO): only for contract changes, security core, or a dispute after round 3.

&#91;embedded content: AOD 2.0 review ladder · 4 checks, 1 revise loop\]

A failure at any level sends the task back to the same Codex session; only round 3 failing reaches Opus or you.

## What not to adopt

Several popular 2026 practices would cost you more than they return on a Pro + Plus budget.

| Practice | Why skip it (for now) |
| --- | --- |
| Claude Code agent teams | Teammates are full Claude instances that message each other; reported cost is roughly 7× a single session in plan mode and up to 15× in other accounts ([source](https://blog.laozhang.ai/en/posts/claude-code-agent-teams), [source](https://theneildave.substack.com/p/5-claude-code-features-shipped-in)). AOD's hub-and-spoke design with Codex workers gives you parallelism on the cheaper pool |
| Large community plugin packs ("100+ agents and skills") | Every always-on instruction costs context on every turn, and mods and plugins run with your user permissions. Install only what you read and need; 4–5 active plugins is the norm cited by heavy users ([source](https://timewell.jp/en/columns/claude-code-complete-guide)) |
| Many MCP connectors | Each connected server adds tool definitions to context. For GitHub, the `gh` CLI called from a skill does the same job with no standing context cost. Anthropic's "code execution with MCP" pattern exists precisely because direct tool loading wastes tokens ([source](https://research.aimultiple.com/code-execution-with-mcp)) |
| Codex cloud tasks as the default | Local and cloud share the Plus pool and cloud chats may use more per task ([source](https://www.developersdigest.tech/blog/codex-usage-limits-pricing-2026)). Use cloud only when your PC is off |
| Kiro or another spec IDE | Paid credits and IDE lock-in for a workflow AOD already has; borrow EARS instead |
| xhigh / ultra reasoning by default | Effort multiplies cost; reserve it for escalations after a failed attempt |

Connectors still earn their place in two cases: GitHub when you work through issues and PRs from your phone, and a docs connector when the PO side of the work happens in shared documents. Everything else can wait until a task actually needs it.

## Migration plan and open uncertainties

Migrate in two weeks on a live project, one change at a time, so the metrics can show which change paid. Record the switch as a new ADR that supersedes the "Agent team protocol" ADR.

**Week 1: routing, delegation, gates**

1. Set defaults: Claude Code on Sonnet 5.5 with `opusplan` for planning; subagent model pinned to Haiku or Sonnet; Codex default Terra at medium.
2. Install `openai/codex-plugin-cc`, run `/codex:setup`, and try `/codex:adversarial-review` on a diff Claude wrote. Turn on the review gate only for UI and security-core branches.
3. Make `report.schema.json` Codex-strict and write the `aod-delegate` skill around `codex exec --output-schema`. Run one small task through it and through Pi side by side; keep whichever needs less of your attention.
4. Install the destructive-git guard, the contract guard and the "done means green" Stop hook.
5. Add the stop clause to the brief template.

**Week 2: memory, integrity, orchestration**

6. Convert playbooks to skills; move "never" rules that can be checked into hooks and delete them from AGENTS.md.
7. Move the task index to `index.json` with a generated Markdown view and two new columns: your attention minutes and pool percentage spent.
8. Add mutation testing for the stack in use (for C++, an LLVM-based tool such as Mull; for Python, mutmut; for TypeScript, Stryker) on changed files only.
9. Save one dynamic workflow for a wave of 2–3 independent ready tasks and run it once.
10. After five tasks, run the §18 retro with the new columns and keep only the changes that moved first-pass acceptance or cost.

**Open uncertainties to verify on your machine**

- Codex's project-level skill path is reported differently across sources (`.codex/skills` vs `.agents/skills`). If Codex scans `.agents/skills` in the repo, AOD's `.agents/` memory folder could double as a shared skill directory for both agents, or could collide with it. Check with a one-skill smoke test before relying on either.
- Whether `/advisor` (Sonnet executes, Opus advises on demand, reported at −11.9% cost and +2.7 points on SWE-bench Multilingual versus Sonnet alone in the API version) is available inside Claude Code on Pro today ([source](https://claude.com/blog/the-advisor-strategy)). If it is, it is a better default than `opusplan` for long implementation sessions.
- Exact per-window limits on both plans. Published figures conflict and change; your `/usage` and Codex usage dashboards over two weeks are the only reliable numbers.
- GPT-5.6 consumption. The high-usage reports are individual GitHub issues, not measurements; compare Terra and Sol yourself on two similar tasks before fixing the routing table.

## Sources

Primary and official sources first, then secondary write-ups; all accessed October 2026.

- [Effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering
- [The advisor strategy](https://claude.com/blog/the-advisor-strategy) — Anthropic
- [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows?utm_campaignId=18788801) — Claude Code docs
- [Agents, agent view and agent teams](https://code.claude.com/docs/en/agents?utm_campaignId=18788801) — Claude Code docs
- [Claude Code changelog](https://code.claude.com/docs/en/changelog) — Anthropic
- [Codex as MCP server (deprecated) and the Codex plugin for Claude Code](https://learn.chatgpt.com/es-419/docs/mcp-server) — OpenAI docs
- [Classifier Context Rot](https://arxiv.org/pdf/2605.12366) — Anthropic Fellows, arXiv 2605.12366
- [EvilGenie: A Reward Hacking Benchmark](https://arxiv.org/abs/2511.21654v1) — arXiv 2511.21654
- [SpecBench: Measuring Reward Hacking in Long-Horizon Coding Agents](https://www.emergentmind.com/papers/2605.21384) — arXiv 2605.21384
- [ImpossibleBench write-up](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1) — LessWrong mirror
- [Self-Preference Is Weak or Absent in Verifiable Instruction-Following Revision](https://arxiv.org/abs/2606.20093) — arXiv 2606.20093
- [Quantifying and Mitigating Self-Preference Bias of LLM Judges](https://arxiv.org/abs/2604.22891) — arXiv 2604.22891
- [Context Rot (Chroma) talk notes](https://hamel.dev/notes/llm/rag/p6-context_rot.html) — Hamel Husain
- [METR productivity update discussion](https://birchtree.me/blog/an-update-from-the-study-that-said-devs-were-actually-slower-with-coding-agents/) and [original study summary](https://getcoai.com/news/study-ai-coding-tools-slow-down-experienced-developers-by-19/)
- [OpenAI Codex plugin for Claude Code](https://zenn.dev/zenchaine/articles/codex-plugin-for-claude-code?locale=en) and [plugin internals](https://oldeucryptoboi.substack.com/p/openai-codex-claude-code-plugin)
- [codex exec JSONL and output-schema reference](https://codex.danielvaughan.com/2026/04/08/codex-exec-jsonl-reference/) and [Codex CLI state of play, May 2026](https://codex.danielvaughan.com/2026/05/23/codex-cli-state-of-play/)
- [Codex subagents and custom agents GA](https://letsdatascience.com/news/openai-codex-adds-subagents-and-custom-agents-c3e4196e)
- [GPT-5.6 Sol vs Terra vs Luna](https://knightli.com/en/2026/07/10/gpt-5-6-sol-terra-luna-comparison/) and [GPT-5.6 usage report, openai/codex #32606](https://github.com/openai/codex/issues/32606)
- [Codex usage limits and pricing 2026](https://www.developersdigest.tech/blog/codex-usage-limits-pricing-2026)
- [Claude Code usage limits](https://www.morphllm.com/claude-code-usage-limits) and [Opus 5.5 vs Sonnet 5.5 on Pro](https://aitoolanalysis.com/?p=3983)
- [Spec-driven development tools compared](https://ssojet.com/blog/best-spec-driven-development-tools) and [Spec Kit vs Kiro](https://codemyspec.com/blog/spec-kit-vs-kiro)
- [Claude Code best practices mapped to surfaces](https://smartscope.blog/en/generative-ai/claude/claude-code-best-practices-advanced-2026/) and [Claude Code timeline](https://www.scriptbyai.com/claude-code-timeline/)
- [Adversarial code review](https://www.augmentcode.com/guides/adversarial-code-review) — Augment Code
- [Code execution with MCP benchmark](https://research.aimultiple.com/code-execution-with-mcp) — AIMultiple
