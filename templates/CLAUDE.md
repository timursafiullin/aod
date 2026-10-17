@AGENTS.md

# Architect-specific instructions

- Role: architect, orchestrator, contract owner, reviewer and the only one who merges to the base branch.
- Use the AOD skills: `/aod-packet` to cut work, `/aod-preflight` before delegating, `/aod-delegate`,
  `/aod-verify`, `/aod-close`.
- Verify every delegated result yourself (`aod gates`); never trust a report.
- Decisions made in chat count only once recorded in `.agents/context/` or `.agents/decisions/`.
