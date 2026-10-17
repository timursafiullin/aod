---
name: adr
description: Record an architecture decision as an ADR in .agents/decisions (context, decision, consequences, alternatives), accept it, or supersede an old one. Use whenever a significant decision is made - in chat, in review, or after a PO answer - so it survives the session.
---

# Architecture Decision Record

A decision counts only once it is in the repository. Write one when a contract, dependency, data format, domain
model or process changes, or when the user settles a choice. CLI: `aod` means
`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod adr new "<the decision, as a sentence>"` creates `ADR-xxxx-<slug>.md` (status Proposed) and an index row.
2. Fill it in English, concise:
   - Context: the forces and constraints, with links to specs, issues and earlier ADRs.
   - Decision: what we will do, stated so it can be checked.
   - Consequences: what gets easier, what gets harder, follow-up work.
   - Alternatives considered: each with the reason it lost.
3. Decide who accepts:
   - The architect accepts decisions that follow from the vision, invariants and existing ADRs.
   - The user (PO) accepts decisions with product, cost, licence or public consequences, and choices between
     equal options. Use `/aod:decision` to ask, and record their answer in the ADR.
4. `aod adr accept ADR-xxxx` (refuses while Context/Decision/Consequences are empty). Accepted ADRs are protected
   by the contract guard.
5. To change an accepted decision, write a new ADR and run `aod adr supersede ADR-old --by ADR-new`; never edit
   the old one's substance.
6. Mention the ADR id in the journal's Decisions section and in any packet whose `contracts` it binds.
