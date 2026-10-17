#!/usr/bin/env node
// PreToolUse(Bash): block destructive git in an AOD repo, any state-changing git inside worktree slots, and
// shell writes to protected paths (contracts, acceptance tests, accepted ADRs, slots) unless unlocked.
import { resolve } from 'node:path';
import { gitInvocations, writeTargets } from '../lib/shellwords.mjs';
import { check as contractCheck } from './contract-guard.mjs';
import { aodProject, block, isInSlots, run } from './common.mjs';

const SLOT_READONLY = new Set([
  'log', 'diff', 'show', 'status', 'rev-parse', 'ls-files', 'ls-tree', 'blame', 'grep', 'cat-file', 'describe',
  'shortlog', 'rev-list', 'merge-base', 'name-rev', 'for-each-ref', 'show-ref', 'whatchanged', 'help', 'version',
]);
const BRANCH_LIST_FLAGS = new Set(['--show-current', '--list', '-l', '-a', '--all', '-r', '--remotes', '-v', '-vv', '--contains', '--merged', '--no-merged']);

const has = (args, ...flags) => args.some((a) => flags.includes(a) || flags.some((f) => /^-[a-zA-Z]+$/.test(a) && f.length === 2 && f[0] === '-' && a.includes(f[1]) && !a.startsWith('--')));

// Returns a reason string when the invocation is destructive anywhere in an AOD repo.
export function destructive({ sub, args }) {
  switch (sub) {
    case 'push':
      if (has(args, '--force', '-f', '--force-with-lease', '--mirror', '--delete', '-d') || args.some((a) => /^[+:]/.test(a))) {
        return 'force-push or remote deletion rewrites shared history';
      }
      return null;
    case 'reset':
      return args.includes('--hard') ? 'reset --hard discards work' : null;
    case 'rebase':
      return 'rebase rewrites history';
    case 'clean':
      return has(args, '-f', '--force') ? 'clean -f deletes untracked files' : null;
    case 'branch':
      return has(args, '-D', '-d', '--delete', '-f', '--force') || args.includes('-M') ? 'branch deletion or forced move' : null;
    case 'checkout':
      return args.includes('--') || args.includes('.') || has(args, '-f', '--force') ? 'checkout of paths or -f discards local changes' : null;
    case 'restore':
      return args.includes('--staged') && !args.includes('--worktree') ? null : 'restore discards local changes';
    case 'stash':
      return ['drop', 'clear'].includes(args[0]) ? 'stash drop/clear loses work' : null;
    case 'update-ref':
      return args.includes('-d') ? 'update-ref -d deletes a ref' : null;
    case 'filter-branch':
    case 'filter-repo':
      return 'history rewrite';
    default:
      return null;
  }
}

export function slotWrite({ sub, args }) {
  if (SLOT_READONLY.has(sub)) return null;
  if (sub === 'branch' && args.every((a) => BRANCH_LIST_FLAGS.has(a) || !a.startsWith('-')) && args.filter((a) => !a.startsWith('-')).length === 0) return null;
  if (sub === 'config' && args.some((a) => ['--get', '--list', '-l', '--get-all'].includes(a))) return null;
  if (sub === 'worktree' && args[0] === 'list') return null;
  if (sub === 'stash' && (args[0] === 'list' || args[0] === 'show')) return null;
  return `git ${sub} changes slot state`;
}

export function check(command, cwd, project) {
  let dir = cwd;
  for (const inv of gitInvocations(command)) {
    if (inv.cd) {
      dir = resolve(dir, inv.cd);
      continue;
    }
    const where = resolve(dir, inv.dir || '.');
    const inAod = aodProject(where);
    if (!inAod || inAod.root !== project.root) continue;
    const bad = destructive(inv);
    if (bad) return `\`git ${inv.sub}\` blocked: ${bad}. This is the user's call; ask them to run it themselves if it is really needed.`;
    if (isInSlots(project, where)) {
      const w = slotWrite(inv);
      if (w) return `\`git ${inv.sub}\` blocked in a worktree slot: ${w}. Slots are managed by the aod CLI (delegate, revise, merge, reject, slot reset); review with read-only git (log, diff, show, status).`;
    }
  }
  return null;
}

// Shell writes (redirections, tee, cp/mv/rm, sed -i, ...) get the same protection as the Edit/Write tools.
export function checkWrites(command, cwd, project) {
  let dir = cwd;
  for (const w of writeTargets(command)) {
    if (w.cd) {
      dir = resolve(dir, w.cd);
      continue;
    }
    const reason = contractCheck(project, w.path, dir);
    if (reason) return `shell write (${w.how}) blocked: ${reason}`;
  }
  return null;
}

run(import.meta.url, (input) => {
  const cwd = input.cwd || process.cwd();
  const project = aodProject(cwd);
  if (!project) return;
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return;
  const reason = (project.config.guards?.git !== false && check(command, cwd, project))
    || (project.config.guards?.contracts !== false && checkWrites(command, cwd, project));
  if (reason) block(reason);
});
