# Changelog

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
