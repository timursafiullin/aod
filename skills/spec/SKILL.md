---
name: spec
description: Write a feature spec (S-xxxx) with EARS requirements, each traced to an acceptance test, before any implementation. Use when a feature or requirement is planned in an AOD project, before cutting task packets.
---

# Feature spec with EARS requirements

CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod spec new "<feature title>"` creates `.agents/specs/S-xxxx-<slug>.md` (status draft).
2. Write Context (who needs it, why, links to ADRs and contracts) and Out of scope.
3. Write requirements, one testable EARS sentence each, numbered R1, R2, ...:
   - Ubiquitous: `The <system> shall <response>.`
   - Event: `When <trigger>, the <system> shall <response>.`
   - State: `While <state>, the <system> shall <response>.`
   - Unwanted behaviour: `If <condition>, then the <system> shall <response>.`
   - Optional feature: `Where <feature is present>, the <system> shall <response>.`
   One "shall" per requirement; no vague words (should, fast, user-friendly, etc.). Cover error cases with
   "If ..., then ...". Under each, add `Acceptance: <test file> :: <test name>` for the test that will prove it.
4. `aod spec check S-xxxx` must report no errors; resolve warnings or say why they stay.
5. Approve before cutting packets (`status: approved`; preflight warns on `draft`):
   - the architect approves a spec that only refines the vision and accepted ADRs (no new product behaviour the
     user has not asked for);
   - anything product-visible, costly or ambiguous goes to the user first (`/aod:decision`).
   Commit the approved spec on the base branch (`docs: S-xxxx`) before `/aod:packet`.
6. Cut packets with `/aod:packet`: set the packet's `spec:` to the spec path and write
   `Implements: R1, R2` in the packet body. Write each acceptance test exactly as traced.
