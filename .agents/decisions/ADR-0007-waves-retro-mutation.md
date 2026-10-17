# ADR-0007: Parallel waves, ledger history and lock, retro metrics, mutation-testing adapter

Status: Accepted
Date: 2026-10-17

## Context

M5 adds throughput and feedback to the delegation loop:

- Methodology §8 lets independent tasks run in parallel slots.
- §18 defines the loop metrics.
- Research §2 adds two columns: the PO's attention minutes and the share of the model pool spent.
- Research §3 lists mutation testing as the integrity check that catches tests that pass without checking
  anything.

Parallel delegations are separate `aod delegate` processes that write the same `index.json`, so a
read-modify-write race could lose updates. The ledger held only end states (`rounds`, `verdicts`, `failures`).
Blocked questions, escalations and gate failures left no trace, so §18 could not be computed.

## Decision

1. **Ledger lock.** Every ledger read-modify-write (`updateTask`, `packet new`) runs under
   `withIndexLock`:
   - the lock is an atomic `mkdir` of `index.json.lock`, with jittered retry and a 30 s timeout;
   - a lock older than 60 s is treated as stale and broken;
   - the lock is re-entrant within one process.
2. **Ledger history.** Tasks gain `events: [{at, type, detail?}]` with these types:
   - `delegated`, `job-failed`, `blocked`, `answered`, `revise`, `escalated`;
   - `gates-fail`, `scope-violation`;
   - `accepted`, `rejected`, `unavailable`.

   Tasks also gain `wave`. `aod task commit` mirrors the packet's `depends_on` into the ledger, and delegate
   checks the union of the ledger's and the packet's dependencies.
3. **Waves.** `aod wave plan [--max N]` selects ready Codex tasks greedily in id order. A task joins the wave when:
   - every dependency is done;
   - it has a task branch and no `codex/` branch;
   - its scope overlaps neither the wave's tasks nor any task still holding a slot (`globsOverlap`);
   - a free slot is left (at most one task per free slot).

   `aod wave run` creates the slots sequentially, then spawns one `aod delegate T --slot S --wave N` child per
   task and waits for all of them. The exit code is 5 if any job hit Codex unavailability, 1 if any other job
   failed, and 0 otherwise. Verification and merges stay sequential and are owned by the architect.
4. **Retro.** `aod retro [--milestone M] [--since D] [--write]` computes these metrics from the ledger alone:
   - first-pass acceptance and average rounds;
   - blocked and escalation rates;
   - median and average elapsed time;
   - scope violations, gate failures, failed jobs and rejects;
   - architect share;
   - attention minutes;
   - tokens, and pool % when `retro.weekly_token_pool` is set;
   - waves, and a per-model table.

   It derives signals from them. Only two thresholds come from the methodology: rounds above 1.5, and any
   scope violation. The others are AOD defaults: first pass below 60 %, blocked rate above 20 %, escalation
   rate above 10 %, architect share above 40 %, pool use above 80 %.
5. **Mutation adapter.** The `mutation` config holds `command` (with an optional `{files}` placeholder),
   `include`, `threshold` (60), `level` (`warn` or `fail`), `timeout_minutes` and `score_regex`. When a command
   is configured, `aod gates` runs it in the slot last, and only once every other gate is green. It runs on the
   changed non-test files. Scores from Stryker, Infection, PIT, cargo-mutants, mutmut-style killed/survived
   counts and Mull are parsed, and `score_regex` overrides the parsing. A missing score or a timeout is a
   warning. `--no-mutation` skips the run.

## Consequences

- Waves need narrow, honest scopes. The overlap check compares glob prefixes, so `src/**` overlaps everything
  under `src/`. Tasks with broad scopes simply wait for the next wave.
- Because merges are sequential, later tasks in a wave are merged onto a base branch that has already moved.
  `aod merge` still probes for conflicts with `merge-tree`, and disjoint scopes keep conflicts rare.
- Old ledgers without `events` still compute. Event-based rates then undercount, and the retro says so
  through `n/a` and thin-data signals.
- Mutation testing is opt-in and tool-agnostic. AOD ships no mutation tool and adds no dependency.

## Alternatives considered

- One long-running scheduler process that keeps slots busy across waves: rejected. Slots free up only after
  review and merge, which is the architect's work, so a scheduler would idle.
- A lock file holding the process id: `mkdir` is simpler and atomic on every platform. The stale-age rule
  covers crashed processes.
- A separate history file per task: the ledger is already the single source of truth (ADR-0002).
