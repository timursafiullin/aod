#!/usr/bin/env node
// AOD command-line entry. Deterministic mechanics live here; skills call it so judgment stays in prompts.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor, formatDoctor } from './lib/doctor.mjs';
import { AodError } from './lib/proc.mjs';
import { indexRender, init, slot, status } from './commands/setup.mjs';
import { packetNew, packetValidate, taskCommit, taskSet } from './commands/tasks.mjs';
import { delegate, gates, merge, reject, revise } from './commands/run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function version() {
  return JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

const USAGE = `aod <command> [options]

Setup
  doctor [--json]                      Check node, git and (optionally) codex
  init [--slots N]                     Scaffold .agents/, AGENTS.md, CLAUDE.md, config and worktree slots
  slot list|create [name|--all]|reset <name> [--force]
  status [T-xxxx]                      Open tasks, slots and running jobs
  index render                         Regenerate .agents/tasks/index.md from index.json

Tasks
  packet new "<title>" [--owner codex|claude] [--milestone M1]
  packet validate T-xxxx
  task commit T-xxxx [paths...]        Commit packet + acceptance tests to task/T-xxxx, stay on base branch
  task set T-xxxx status=ready [notes=...] [attention_minutes=N]

Delegation loop
  delegate T-xxxx [--slot codex-1] [--model M] [--effort E] [--force]
  revise T-xxxx --findings <file> [--answer]   Resume the Codex thread with review findings (or an answer)
  gates T-xxxx                         Scope, skip markers, report schema, acceptance re-run
  merge T-xxxx [--reviewed-by X] [--attention N] [--prune]
  reject T-xxxx [--cancel]

Exit codes: 0 ok, 1 failed, 2 usage, 3 blocked (implementer asked a question), 4 escalate to PO.`;

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
  'task commit': taskCommit,
  'task set': taskSet,
  delegate,
  revise,
  gates,
  merge,
  reject,
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
    console.log(JSON.stringify(result, null, 2));
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
