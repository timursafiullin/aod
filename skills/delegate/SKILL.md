---
name: delegate
description: Delegate a ready AOD task packet to a Codex implementer in a worktree slot, running in the background with a schema-enforced report. Use when a task is ready and the user or architect wants it implemented by Codex.
---

# Delegate T-xxxx to Codex

1. The task must be `ready` (run `/aod:preflight` first). Check slots with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" status`. Slots are created on demand from the base branch.
2. Start the job as a **background** shell command so you are notified when it ends (do not poll):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" delegate T-xxxx`
   The model comes from the routing (`aod route show`): `implement` first, `escalate` automatically after a failed
   job or from review round 2. Override only with evidence: `--model <id>`, `--effort low|medium|high`, `--slot codex-2`.
3. While it runs, do other work: prepare the next packet, write contracts, or review another task.
4. When notified, read the JSON result:
   - exit 0, `status: review` -> run `/aod:verify T-xxxx`.
   - exit 3, `status: blocked` -> the implementer asked `open_questions`. Answer from ADRs/spec if possible;
     otherwise ask the user (context, options, recommendation). Record the answer in the packet if it is a decision, write the
     answer to a file and resume (background):
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" revise T-xxxx --findings <file> --answer`
   - exit 1, `status: failed` -> read `.agents/tasks/jobs/T-xxxx/stderr.log` and the `error`; fix the
     environment and retry, or `aod reject T-xxxx` and split the task. The result's `failures` counts failed jobs; at 2, reject and split the task.

   - exit 5 -> Codex is unavailable or out of quota. The task is back to `ready` and nothing was counted as a
     failure. Stop and ask the user (`/aod:decision`): wait for the quota window, switch the preset
     (`aod route preset economy`), or something else. Never implement it yourself without the user's go-ahead.

Never trust the report's claims; verification happens in `/aod:verify`.
