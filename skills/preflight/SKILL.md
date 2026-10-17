---
name: preflight
description: Pre-flight check of an AOD task packet before delegation - consistency of packet, spec, ADRs, contracts and acceptance tests, and that acceptance fails for the expected reason. Use before /aod:delegate.
---

# Pre-flight for T-xxxx

CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. Run the deterministic checks:
   `aod preflight T-xxxx`
   It verifies the packet front matter, the `task/T-xxxx` branch, `depends_on`, every `contracts` entry (files exist
   on the task branch, ADRs are Accepted), the spec (EARS lint, requirement ids named in the packet), new
   acceptance tests, scope overlap with active tasks and brief size. It then runs every acceptance command on a
   checkout of `task/T-xxxx` (a free slot or a temporary worktree). Each must fail, and for the right reason:
   a failing assertion, or "module not found" for a module inside the task scope. A command that passes, or fails
   with a syntax error, an out-of-scope missing module or a missing tool, is a `fail`.
2. Any `fail`: fix it (`aod packet restore T-xxxx`, edit, `aod task commit T-xxxx ...`; acceptance-test edits
   need `aod unlock --reason ...` first and `aod lock` after), then run preflight again.
3. Judge what a script cannot: read the packet (`aod packet show T-xxxx`) next to the spec, ADRs and contracts it
   names, and confirm they do not contradict each other (names, types, units, error cases) and that the tail of
   each red acceptance run is about the missing behaviour. Resolve or accept each `warn` explicitly.
4. If everything holds: `aod task set T-xxxx status=ready`, then `/aod:delegate T-xxxx`.
