# ADR-0006: Model routing presets (default "max"), stop-and-ask when Codex is unavailable, cross-family tools

Status: Accepted
Date: 2026-10-17

## Context

The AOD 2.0 research proposed a routing table built on GPT-5.6 Terra/Sol/Luna. A spike against the user's Codex
(codex-cli 0.163.0, 2026-10-17) found:

- The available models are gpt-6.1-sol, gpt-6-sol, gpt-6-astra, gpt-6-luna and gpt-5.6-sol/terra/luna. The user's
  Codex default is gpt-6.1-sol. Model names change faster than the plugin, so AOD must not hard-code them.
- `codex exec review [--base B | --commit SHA | --uncommitted]` reviews natively, giving cross-family review of
  changes Claude makes itself.
- Codex loads repo skills from both `.agents/skills/` and `.codex/skills/`, which resolves ADR-0001's open item.
- `claude -p` supports `--json-schema` and `--resume`, so a headless Claude implementer is feasible.

The product owner decided (2026-10-17):

- Routing preset: **max quality**.
- When Codex is unavailable or out of quota: **stop and ask**, with no automatic fallback to a Claude implementer.

## Decision

1. `aod.config.json` gains `routing` with three roles: `implement`, `escalate` and `explore`, each `{ model, effort }`.
   `aod route preset <economy|balanced|max>` writes a preset, and `aod route show` prints it. The default preset is
   `max`:
   - implement: gpt-6.1-sol, medium
   - escalate: gpt-6.1-sol, high
   - explore: gpt-6-luna, low

   The other presets are `economy` (gpt-5.6-terra / gpt-6.1-sol high / gpt-5.6-luna) and `balanced`
   (gpt-6-luna / gpt-6.1-sol high / gpt-5.6-luna). A model missing from `~/.codex/models_cache.json` is a doctor
   warning, not an error.
2. Escalation by evidence: `delegate` uses `escalate` once the task has a failed job, and `revise` uses it from
   round 2 on. A packet's own `model` or `effort`, or a CLI flag, overrides the routing.
3. Codex unavailable (not found) or out of quota (usage, rate or quota limit in the JSONL or stderr): the job
   ends with exit code 5. The task returns to `ready` without counting a failure, and the CLI tells the architect
   to stop and ask the user with `/aod:decision`. There is no automatic Claude fallback.
4. Implementer skill `aod-implementer` is scaffolded by `aod init` into `.agents/skills/aod-implementer/SKILL.md`.
   Codex loads it in every slot. It restates the brief's rules (scope, stop rule, no git, report).
5. `aod review [--base B | --commit SHA | --uncommitted] [--focus "<text>"]` runs `codex exec review` on the
   main checkout with the `implement` model. The architect uses it before committing their own UI or
   security-core work (methodology §4.2 gap, research §4). `aod explore "<question>"` runs a read-only
   `codex exec` with the `explore` model and asks for a short answer citing `path:line`.

## Consequences

- codex-cli 0.163 rejects a review target flag combined with custom instructions. `aod review --focus` therefore
  uses instruction mode and names the diff in the prompt; without `--focus` it uses the native targeted review.
  Both were verified live (2026-10-17).

- Max quality spends the Plus quota fastest. `aod route preset economy` switches with one command, and the
  ledger's usage column shows the cost.
- When the quota runs out, delegation pauses until the user decides. No work happens silently on another
  model family.
- The roadmap's M4 exit criterion "Claude-only and Claude+Codex modes both pass e2e" is replaced by
  "unavailability and quota stop cleanly with exit 5".

## Alternatives considered

- Headless Claude implementer as the fallback: feasible but declined by the PO (keeps cross-family review and
  the budget split explicit).
- The research's Terra-based table: kept as the `economy` preset.
