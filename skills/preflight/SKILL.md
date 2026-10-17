---
name: preflight
description: Pre-flight check of an AOD task packet before delegation - consistency of packet, spec, ADRs, contracts and acceptance tests, and that acceptance fails for the expected reason. Use before /aod:delegate.
---

# Pre-flight for T-xxxx

Run every check; mark the task ready only if all pass. CLI: `aod` means
`node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. `aod packet validate T-xxxx` succeeds.
2. Read the packet with `aod packet show T-xxxx`. Confirm:
   - every path in `contracts` and `spec` exists on `task/T-xxxx` and every referenced ADR is `Accepted`;
   - the spec, ADRs, contracts and packet do not contradict each other (names, types, units, error cases);
   - `scope` covers everything the task needs to touch and nothing more;
   - all `depends_on` tasks are `done` (`aod status --all`).
3. Acceptance fails for the right reason. Check out `task/T-xxxx` read-only in a temporary place, e.g.
   `git worktree add --detach <tmp dir> task/T-xxxx`, run each acceptance command there in bash, then
   `git worktree remove <tmp dir>`. Each command must fail because the feature is missing. Expected reasons:
   a failing assertion, or "module not found" for exactly the module the task creates. Wrong reasons: a syntax
   error in the test, a missing module the task does not create, a bad path in the command, a missing tool.
4. The brief will be under ~6000 characters: the packet body references files instead of pasting them.
5. If everything passes: `aod task set T-xxxx status=ready`.
   Otherwise fix it (`aod packet restore T-xxxx`, edit, `aod task commit T-xxxx ...`) and report what was wrong.
