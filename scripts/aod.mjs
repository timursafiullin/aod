#!/usr/bin/env node
// AOD command-line entry. Deterministic mechanics live here; skills call it so judgment stays in prompts.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor, formatDoctor } from './lib/doctor.mjs';
import { AodError } from './lib/proc.mjs';
import { indexRender, init, slot, status } from './commands/setup.mjs';
import { packetNew, packetRestore, packetShow, packetValidate, taskCommit, taskSet, taskSync } from './commands/tasks.mjs';
import { delegate, gates, merge, reject, revise } from './commands/run.mjs';
import { lock, scopeCheck, unlock } from './commands/guard.mjs';
import { adrAccept, adrNew, adrSupersede, journalCheck, journalNew, sessionEnd, sessionStart, specCheck, specNew } from './commands/memory.mjs';
import { preflight } from './commands/preflight.mjs';
import { explore, review, routePreset, routeShow } from './commands/codex.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function version() {
  return JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

const USAGE = `aod <command> [options]

Setup
  doctor [--json]                      Check node, git and (optionally) codex
  init [--slots N]                     Scaffold .agents/, AGENTS.md, CLAUDE.md, config and the task ledger
  slot list|create [name|--all]|reset <name> [--force]
  status [T-xxxx] [--all]              Open (or all) tasks, slots and running jobs
  index render                         Regenerate .agents/tasks/index.md from index.json

Tasks
  packet new "<title>" [--owner codex|claude] [--milestone M1]
  packet validate T-xxxx
  packet show T-xxxx                   Print the packet (working tree or task/T-xxxx)
  packet restore T-xxxx                Put a committed packet back in the working tree to edit it
  task commit T-xxxx [paths...]        Commit packet + acceptance tests to task/T-xxxx, stay on base branch
  task sync T-xxxx [--force]           Merge the base branch into task/T-xxxx (specs/ADRs committed later)
  task set T-xxxx status=ready [notes=...] [attention_minutes=N]

Memory and sessions
  session start                        Briefing + baseline checks (session.baseline) before new work
  session end [--commit]               Journal complete, no jobs/unlock, commit .agents memory changes
  journal new [--topic slug] [--task T-xxxx] [--new]   Today's entry (reused if it exists)
  journal check [file]                 Required sections present, Next step filled
  adr new "<decision>" | adr accept ADR-xxxx | adr supersede ADR-old --by ADR-new
  spec new "<feature>" | spec check S-xxxx   EARS lint and acceptance tracing

Delegation loop
  preflight T-xxxx [--no-run]          Packet, branch, deps, contracts/ADRs, spec, overlap, brief size; acceptance red for the right reason
  delegate T-xxxx [--slot codex-1] [--model M] [--effort E] [--force]
  revise T-xxxx --findings <file> [--answer]   Resume the Codex thread with review findings (or an answer)
  gates T-xxxx                         Scope, skip markers, report schema, acceptance re-run
  merge T-xxxx [--reviewed-by X] [--attention N] [--journal .agents/journal/F.md] [--prune]
  reject T-xxxx [--cancel]

Codex routing and cross-family tools
  route show | route preset <max|balanced|economy>   Models per role (implement, escalate, explore)
  review [--base B | --commit SHA | --uncommitted] [--focus "..."]   Codex reviews changes Claude made itself
  explore "<question>" [--lines 30]    Read-only Codex research; answer cites path:line

Guardrails
  unlock --reason "<why>" [--minutes 30]   Allow edits to contracts/acceptance tests/accepted ADRs for a while
  lock                                 End the unlock early
  scope check                          (slot pre-commit hook) staged files must be inside the packet scope

Exit codes: 0 ok, 1 failed, 2 usage, 3 blocked (implementer asked a question), 4 escalate to PO,
5 Codex unavailable or out of quota (stop and ask the user).`;

export function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else args.push(a);
  }
  return { args, flags };
}

const COMMANDS = {
  init: (c) => init({ ...c, slots: c.flags.slots }),
  slot,
  status,
  'index render': indexRender,
  'packet new': packetNew,
  'packet validate': packetValidate,
  'packet show': packetShow,
  'packet restore': packetRestore,
  'task commit': taskCommit,
  'task set': taskSet,
  'task sync': taskSync,
  delegate,
  revise,
  gates,
  merge,
  reject,
  unlock,
  lock,
  'scope check': scopeCheck,
  preflight,
  'adr new': adrNew,
  'adr accept': adrAccept,
  'adr supersede': adrSupersede,
  'spec new': specNew,
  'spec check': specCheck,
  'journal new': journalNew,
  'journal check': journalCheck,
  'session start': sessionStart,
  'session end': sessionEnd,
  'route show': routeShow,
  'route preset': routePreset,
  review,
  explore,
};

function resolveCommand(args) {
  const two = `${args[0]} ${args[1]}`;
  if (COMMANDS[two]) return [COMMANDS[two], args.slice(2)];
  if (COMMANDS[args[0]]) return [COMMANDS[args[0]], args.slice(1)];
  return [null, args];
}

export async function main(argv, cwd = process.cwd()) {
  const [cmd] = argv;
  if (cmd === '--version' || cmd === '-v') {
    console.log(version());
    return 0;
  }
  if (cmd === undefined || ['help', '--help', '-h'].includes(cmd)) {
    console.log(USAGE);
    return 0;
  }
  if (cmd === 'doctor') {
    const report = runDoctor();
    console.log(argv.includes('--json') ? JSON.stringify(report, null, 2) : formatDoctor(report));
    return report.ok ? 0 : 1;
  }
  const { args, flags } = parseArgs(argv);
  const [handler, rest] = resolveCommand(args);
  if (!handler) {
    console.error(`Unknown command: ${args.join(' ')}\n\n${USAGE}`);
    return 2;
  }
  try {
    const out = await handler({ cwd, args: rest, flags });
    const { exit, result } = out && 'exit' in out && 'result' in out ? out : { exit: 0, result: out };
    if (result && typeof result.raw === 'string') process.stdout.write(result.raw.endsWith('\n') ? result.raw : `${result.raw}\n`);
    else console.log(JSON.stringify(result, null, 2));
    return exit;
  } catch (e) {
    if (!(e instanceof AodError)) throw e;
    console.error(`aod: ${e.message}`);
    return e.code;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
