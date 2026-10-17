# Changelog

## 0.5.0 — M4 cross-family and routing

- Routing presets `max` (default), `balanced`, `economy`; `aod route show|preset`; escalation after a failed job or
  from review round 2. Breaking: `codex.model`/`codex.effort` are no longer read; use `routing`.
- Codex unavailable or out of quota: exit 5, task back to `ready`, no failure counted; stop and ask (ADR-0006).
- `aod review` (Codex reviews Claude-written changes) and `aod explore` (read-only Codex research);
  skills `/aod:cross-review`, `/aod:explore`.
- `aod init` scaffolds `.agents/skills/aod-implementer`, which Codex loads in every slot.

## 0.4.1 — M3.1 dry-run fixes

- `aod task commit` refuses while the referenced spec/ADRs are uncommitted on the base branch; new `aod task sync`.
- Bash hook (`bash-guard`) now also blocks shell writes to protected paths and slots (redirects, tee, cp/mv/rm,
  sed -i, dd, git rm/mv) unless unlocked.
- EARS lint accepts commas inside clauses and explains what is missing.
- One ledger rule across skills; `session end` without `--commit` is `pending-commit`, not an error.
- `session start` warns when no baseline is configured and briefs first sessions; init offers `session.baseline`.
- Packet template: `Implements:` line, acceptance placeholder (validation rejects leftovers), budget 30.
- Spec approval and pending-decision rules in the skills; ADR slugs stop at word boundaries; ADR-0005.

## 0.4.0 — M3 memory and sessions

- Skills: `/aod:session-start`, `/aod:session-end`, `/aod:adr`, `/aod:spec`, `/aod:decision`; `/aod:preflight` now
  runs the CLI check.
- CLI: `session start|end`, `journal new|check`, `adr new|accept|supersede`, `spec new|check` (EARS lint and
  acceptance tracing), `preflight` (contracts/ADRs, spec, overlap, brief size, red-for-the-right-reason).
- Templates: spec and journal; config `session.baseline`. ADR-0004.

## 0.3.0 — M2 guardrails

- Hooks: SessionStart briefing (+ invariants after compaction), git guard, contract guard with
  `aod unlock|lock`, opt-in Stop "done means green" gate. All silent outside AOD repositories.
- Slot pre-commit scope guard via per-worktree `core.hooksPath` and `aod scope check`.
- Integrity checks in gates (fail: deleted tests, skip markers, test-run detection; warn: modified tests,
  tolerance changes, special-cased acceptance literals). Ledger counts failed jobs.
- ADR-0003.

## 0.2.1 — M1.1 dry-run fixes

- Skills renamed to `/aod:init`, `/aod:packet`, `/aod:preflight`, `/aod:delegate`, `/aod:verify`, `/aod:close`,
  `/aod:doctor`; agent renamed to `aod:reviewer`. `/aod:init` can now be invoked by the model.
- Reviewer is strictly read-only; gates check the slot HEAD, and `aod merge` refuses if the slot changed after gates.
- New `aod packet show|restore`, `aod status --all`, `aod merge --journal` (journal lands in the squash commit).
- `aod init` no longer creates slots; `aod delegate` creates them on demand from the base branch.
- Skill wording: preflight "right reason" rules, ledger policy, milestone source, `rounds` = REVISE rounds.

## 0.2.0 — M1 delegation loop

- `aod init|packet|task|slot|status|delegate|revise|gates|merge|reject` CLI commands.
- Skills: aod-init, aod-packet, aod-preflight, aod-delegate, aod-verify, aod-close; `aod-reviewer` subagent.
- Codex-strict report schema; JSON task ledger with generated Markdown view.
- End-to-end tests with a fake Codex.

## 0.1.0 — M0 foundations

- Plugin and marketplace manifests, `aod doctor`, CI.
