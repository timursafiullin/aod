# 2026-10-17 — M4 cross-family and routing

Agent: architect   Task: none

## Done
- PR #1 (M0–M3.1) merged into master after CI went green on 3 OS x Node 20/22 (path canonicalisation fix).
- Spike against codex-cli 0.163: models gpt-6.1-sol, gpt-6-sol, gpt-6-astra, gpt-6-luna and gpt-5.6-*; native
  `codex exec review`; Codex loads repo skills from `.agents/skills` and `.codex/skills`; `claude -p` supports
  `--json-schema` and `--resume`.
- The PO chose the max-quality routing and stop-and-ask when Codex is unavailable (ADR-0006).
- Routing presets with escalation; exit 5 for an unavailable Codex or exhausted quota; `aod-implementer` skill
  scaffolded for Codex; `aod review` and `aod explore`; skills `/aod:cross-review` and `/aod:explore`.
- 37 tests. Live checks:
  - `aod explore` (gpt-6-luna) answered with path:line citations;
  - `aod review --commit` (gpt-6.1-sol) found no defects;
  - `aod review --focus` found 1 finding: aod-toy's `evaluate` throws RangeError before syntax validation on "1/0 +".

## Not done
- The aod-toy finding (RangeError before syntax validation) is not fixed. That repo is a throwaway.
- No live run of the escalation path or the quota stop (both covered by fake-Codex tests only).

## Decisions
- ADR-0006: routing presets (default max), stop and ask on Codex unavailability, review and explore tools.

## Open questions
- The real Codex quota-exhaustion message is not observed yet; QUOTA_RE is a best guess (usage limit, rate limit, 429).

## Next step
- Open a PR for claude/m4-cross-family, then start M5 (parallel waves of independent tasks, `aod retro` metrics,
  mutation-testing adapters).
