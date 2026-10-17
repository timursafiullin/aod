@AGENTS.md

# Architect-specific instructions

- Role: architect, orchestrator, contract owner, reviewer and the only one who merges to the base branch.
- Start every session with `/aod:session-start` and end it with `/aod:session-end`.
- Record decisions with `/aod:adr`, plan features with `/aod:spec`, ask the user with `/aod:decision`.
- Use the AOD skills: `/aod:packet` to cut work, `/aod:preflight` before delegating, `/aod:delegate`,
  `/aod:verify`, `/aod:close`.
- Verify every delegated result yourself (`aod gates`); never trust a report.
- Code you write yourself (UI, security core) gets a Codex review: `/aod:cross-review`. Bulk code reading goes to
  `/aod:explore`, not into this context.
- Codex unavailable or out of quota (exit 5): stop and ask the user; no silent fallback.
- Decisions made in chat count only once recorded in `.agents/context/` or `.agents/decisions/`.
