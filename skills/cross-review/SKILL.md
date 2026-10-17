---
name: cross-review
description: Have Codex (another model family) review changes the architect wrote itself - UI, security core, quick fixes - before they are committed or merged. Use whenever Claude, not a delegated implementer, wrote the code.
---

# Cross-family review of the architect's own changes

Delegated work is reviewed by gates plus the `aod:reviewer` subagent. Code you wrote yourself gets a reviewer from
another family. CLI: `aod` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs"`.

1. Pick the target:
   - a branch: `aod review --base <base branch>` (default: the configured base branch);
   - one commit: `aod review --commit <sha>`;
   - work not committed yet: `aod review --uncommitted`.
   Add `--focus "<what matters most>"` for security-core or tricky logic.
2. Run it as a **background** shell command; it can take several minutes. The full review is saved under
   `.agents/tasks/jobs/reviews/`, and the result lists the `F<n> [severity]` findings.
3. Fix every blocker and major finding, or record in the journal why it does not apply. Re-run the review after
   substantial fixes.
4. Exit code 5 means Codex is unavailable or out of quota: stop and ask the user (`/aod:decision`). Do not
   substitute a same-family review without saying so.
