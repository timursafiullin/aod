# ADR-0002: Delegation via `codex exec`, JSON ledger, task branches

Status: Accepted
Date: 2026-10-17

## Context

ADR-0001 left the `codex exec` interface unverified. A spike against codex-cli 0.163.0 (Windows, ChatGPT login)
established the facts below.

| Fact | Consequence for AOD |
| --- | --- |
| `codex exec [-C dir] [-m model] [-s read-only\|workspace-write\|danger-full-access] [-c key=value] [--add-dir DIR] [--output-schema FILE] [--json] [-o FILE] [PROMPT\|-]` | All delegation flags exist; the brief is passed on stdin (`-`) to avoid shell quoting and length limits |
| Without a prompt argument Codex prints `Reading additional input from stdin...` and waits | The CLI always pipes the brief and closes stdin |
| `--json` emits JSONL; first event `{"type":"thread.started","thread_id":"<uuid>"}`; `turn.completed` carries `usage` (input/cached/output/reasoning tokens) | `thread_id` is stored per job for `resume`; usage feeds the metrics |
| `--output-schema` + `-o` writes the final message as schema-conformant JSON | The report is enforced by Codex; AOD re-validates as a gate |
| `codex exec resume <id> [PROMPT\|-]` has no `--cd`/`-s`; it filters sessions by cwd | Revisions are spawned with `cwd = slot` |
| The standalone installer puts `codex.exe` in `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin`, which may be absent from PATH of already-running shells | AOD locates Codex via `AOD_CODEX_CMD` env, config `codex.command`, PATH, then known install dirs |
| Under `-s workspace-write` Codex keeps `.git` read-only by design, and `--add-dir <repo>/.git` does not lift it (verified on Windows: `index.lock: Permission denied`) | The implementer never commits. AOD commits the slot's working-tree changes after each run (author `Codex (AOD implementer)`), and the scope gate judges every file. The sandbox stays on |
| Model reasoning effort is a config key | Passed as `-c model_reasoning_effort="<effort>"` |

## Decision

1. `aod delegate` spawns `codex exec` in the slot, in the foreground of its own process; the skill runs it as a
   background shell job so the harness notifies on exit (no polling). Job artefacts (brief, events, report, state,
   gates) live in `.agents/tasks/jobs/T-xxxx/` (git-ignored).
2. `.agents/tasks/index.json` is the single source of truth for task status, rounds, slot, thread and usage.
   `index.md` is generated. Packet front matter carries no `status`.
3. Branches: the architect commits the packet and acceptance tests on `task/T-xxxx` (via `aod task commit`, which
   builds the commit with a temporary index and never switches the main checkout's branch); the implementer works on `codex/T-xxxx`, created in the slot from
   `task/T-xxxx`. Implementer changes are therefore exactly `task/T-xxxx..codex/T-xxxx`, which is what the scope
   gate checks.
4. The report is written by Codex to the job directory, not committed by the implementer; `aod merge` copies it
   to `.agents/tasks/T-xxxx.report.json` in the squash commit.
5. Commits: the implementer leaves changes uncommitted; `aod delegate`/`aod revise` commit them as
   `T-xxxx: <title>` / `T-xxxx: address review round N`. This keeps Codex's sandbox enabled instead of
   granting it write access to `.git`.
6. The report schema is Codex-strict (every property required, `additionalProperties: false` at every level, no
   length keywords); length limits are checked by the gate.

## Consequences

- The main checkout never needs the implementer's branch checked out; ledger edits on the base branch never
  conflict with task branches.
- Codex sessions persist on disk (no `--ephemeral`) so `resume` works.

## Alternatives considered

- Keeping the Pi MCP bridge: more moving parts, no schema enforcement.
- `codex exec --worktree` (Codex-managed worktrees): loses persistent slots and shared build caches.
