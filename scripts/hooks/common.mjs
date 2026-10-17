// Shared plumbing for Claude Code hook handlers. Hooks must stay silent (exit 0) outside AOD projects,
// because the plugin is usually installed for every project of the user.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject } from '../lib/project.mjs';

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// AOD project for a directory, or null when the directory is not inside an initialised AOD repo.
export function aodProject(cwd) {
  try {
    const project = openProject(cwd);
    return project.initialized ? project : null;
  } catch {
    return null;
  }
}

// Path of `p` relative to the repo root or a slot, with forward slashes; null when outside both.
export function locate(project, p, cwd) {
  const abs = resolve(cwd || project.root, p);
  const rel = (base) => {
    const r = relative(base, abs);
    return r && !r.startsWith('..') && !isAbsolute(r) ? r.replace(/\\/g, '/') : null;
  };
  const inRoot = rel(project.root);
  if (inRoot !== null && !inRoot.startsWith('../')) return { where: 'main', path: inRoot };
  for (const name of project.slotNames()) {
    const inSlot = rel(project.slotPath(name));
    if (inSlot !== null) return { where: name, path: inSlot };
  }
  return null;
}

export function isInSlots(project, dir) {
  const r = relative(project.worktrees, resolve(dir));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

export function block(reason) {
  process.stderr.write(`AOD guard: ${reason}\n`);
  process.exit(2);
}

// Run the handler only when the file is executed as a hook, not when tests import it.
export function run(url, handler) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(url)) return;
  try {
    handler(readInput());
  } catch (e) {
    // A crashing guard must never wedge the session; report and allow.
    process.stderr.write(`AOD hook error (ignored): ${e.message}\n`);
    process.exit(0);
  }
}
