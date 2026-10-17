---
name: aod-preflight
description: Pre-flight check of an AOD task packet before delegation - consistency of packet, spec, ADRs, contracts and acceptance tests, and that acceptance fails for the expected reason. Use before /aod-delegate.
---

# Pre-flight for T-xxxx

Run every check; mark the task ready only if all pass.

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" packet validate T-xxxx` succeeds.
2. Read the packet with `git show task/T-xxxx:.agents/tasks/T-xxxx.md`. Confirm:
   - every path in `contracts` and `spec` exists on `task/T-xxxx` and every referenced ADR is `Accepted`;
   - the spec, ADRs, contracts and packet do not contradict each other (names, types, units, error cases);
   - `scope` covers everything the task needs to touch and nothing more;
   - all `depends_on` tasks are `done` (`aod status`).
3. Acceptance fails for the right reason: in a free slot or a temporary checkout of `task/T-xxxx`, run each
   acceptance command; it must fail because the feature is missing, not because of a syntax, import or
   environment error. Use the implementer's shell (bash).
4. The brief will be under ~6000 characters: the packet body references files instead of pasting them.
5. If everything passes:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" task set T-xxxx status=ready`
   Otherwise fix the packet (re-run `aod task commit T-xxxx ...`) and report what was wrong.
