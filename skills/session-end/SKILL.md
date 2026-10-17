---
name: session-end
description: End an AOD architect session - write the journal entry (done, not done, decisions, open questions, next step), check it, and commit the project memory so the next session starts from a clean tree. Use when the user wraps up, before a long break, or when the context is getting long.
---

# End an architect session

CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod journal new --topic <short-slug>` returns today's entry (creating it from the template if needed).
2. Fill every section, short and factual:
   - Done: tasks merged (ids, rounds), ADRs/specs written, anything verified.
   - Not done: what was planned but not finished, and why.
   - Decisions: one line each with the ADR id; a decision made in chat that is not in an ADR yet gets one now
     (`/aod:adr`).
   - Open questions: pending decision requests to the user, unknowns.
   - Next step: the single concrete action the next session should start with (task id, command, file).
3. `aod journal check` must pass.
4. If contracts are unlocked, `aod lock`. Background jobs still running are noted in the journal.
5. `aod session end` reports what is left (`status: pending-commit` is normal, not an error). When only `.agents/` memory files are pending and the user agrees,
   `aod session end --commit` commits them (`docs: session journal <date>`). Code changes are committed
   separately, never folded into the journal commit.

Ledger rule: `.agents/tasks/index.json` and `index.md` may stay uncommitted on the base branch while you work.
They are committed by `aod merge` (with the task) or by `aod session end --commit`, whichever comes first, and
never on a task branch.
