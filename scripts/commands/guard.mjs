// aod unlock | lock | scope check
import { appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { matchesAny, normalizePath } from '../lib/glob.mjs';
import { openProject, readPacket, requireInitialized, writeJson } from '../lib/project.mjs';
import { AodError, git, now } from '../lib/proc.mjs';
import { scopeViolations, forbiddenFor } from './run.mjs';

export function unlock({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
  if (!reason) throw new AodError('usage: aod unlock --reason "<why contracts/acceptance tests must change>" [--minutes 30]', 2);
  const minutes = Math.min(Number(flags.minutes) || 30, 240);
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  writeJson(join(project.agents, '.unlock'), { reason, until, at: now() });
  const log = join(project.tasksDir, 'jobs');
  mkdirSync(log, { recursive: true });
  appendFileSync(join(log, 'unlocks.log'), `${now()}\t${minutes}m\t${reason}\n`);
  return { unlocked: project.config.protected, until, reason, next: 'make the edits, then aod lock' };
}

export function lock({ cwd }) {
  const project = requireInitialized(openProject(cwd));
  const p = join(project.agents, '.unlock');
  const was = existsSync(p);
  rmSync(p, { force: true });
  return { locked: true, was_unlocked: was };
}

// Used by the slot pre-commit hook: staged files on codex/T-xxxx must stay inside the packet scope.
export function scopeCheck({ cwd }) {
  const project = requireInitialized(openProject(cwd));
  const branch = git(['branch', '--show-current'], cwd);
  const m = /^codex\/(T-\d{4})$/.exec(branch);
  if (!m) return { checked: false, reason: `not on a codex/T-xxxx branch (${branch || 'detached'})` };
  const id = m[1];
  const { data: packet } = readPacket(project, id);
  const staged = git(['diff', '--cached', '--name-only'], cwd).split('\n').filter(Boolean).map(normalizePath);
  const violations = scopeViolations(staged, packet.scope, forbiddenFor(project, packet));
  if (violations.length) {
    throw new AodError(`AOD scope guard: ${id} may not commit these paths:\n  ${violations.join('\n  ')}\n`
      + `Allowed: ${packet.scope.join(', ')}`);
  }
  return { checked: true, id, files: staged.length, in_scope: staged.every((f) => matchesAny(f, packet.scope)) };
}
