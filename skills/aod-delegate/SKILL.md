---
name: aod-delegate
description: Delegate a ready AOD task packet to a Codex implementer in a worktree slot, running in the background with a schema-enforced report. Use when a task is ready and the user or architect wants it implemented by Codex.
---

# Delegate T-xxxx to Codex

1. The task must be `ready` (run `/aod-preflight` first). Check slots with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" status`.
2. Start the job as a **background** shell command so you are notified when it ends (do not poll):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" delegate T-xxxx`
   Options: `--slot codex-2`, `--model <id>`, `--effort low|medium|high`. Escalate model or effort only after
   a failed attempt.
3. While it runs, do other work: prepare the next packet, write contracts, or review another task.
4. When notified, read the JSON result:
   - exit 0, `status: review` -> run `/aod-verify T-xxxx`.
   - exit 3, `status: blocked` -> the implementer asked `open_questions`. Answer from ADRs/spec if possible;
     otherwise ask the user (context, options, recommendation). Record the answer in the packet if it is a decision, write the
     answer to a file and resume (background):
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/aod.mjs" revise T-xxxx --findings <file> --answer`
   - exit 1, `status: failed` -> read `.agents/tasks/jobs/T-xxxx/stderr.log` and the `error`; fix the
     environment and retry, or `aod reject T-xxxx` and split the task. Two failed jobs in a row: split the task.

Never trust the report's claims; verification happens in `/aod-verify`.
