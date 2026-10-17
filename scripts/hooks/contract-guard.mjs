#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|NotebookEdit): protect contracts, acceptance tests, accepted ADRs and slots.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchesAny } from '../lib/glob.mjs';
import { aodProject, block, locate, run } from './common.mjs';

export function activeUnlock(project, now = Date.now()) {
  const p = join(project.agents, '.unlock');
  if (!existsSync(p)) return null;
  try {
    const u = JSON.parse(readFileSync(p, 'utf8'));
    return Date.parse(u.until) > now ? u : null;
  } catch {
    return null;
  }
}

export function isAcceptedAdr(project, rel) {
  if (!/^\.agents\/decisions\/ADR-[^/]+\.md$/.test(rel)) return false;
  const p = join(project.root, rel);
  return existsSync(p) && /^Status:\s*Accepted\b/m.test(readFileSync(p, 'utf8'));
}

export function check(project, filePath, cwd) {
  const loc = locate(project, filePath, cwd);
  if (!loc) return null;
  if (loc.where !== 'main') {
    return `${loc.where} is an implementer worktree slot; the architect does not edit it. Send findings with aod revise instead.`;
  }
  const protectedHit = matchesAny(loc.path, project.config.protected || []);
  const adr = isAcceptedAdr(project, loc.path);
  if (!protectedHit && !adr) return null;
  if (activeUnlock(project)) return null;
  const what = adr ? 'an accepted ADR (supersede it with a new ADR instead of editing it)' : 'a contract or acceptance test';
  return `${loc.path} is ${what}. If this edit is deliberate architect work (writing a spec, contract or acceptance test `
    + 'for a packet), run `aod unlock --reason "<why>"` first; never edit these to make an implementation pass.';
}

run(import.meta.url, (input) => {
  const cwd = input.cwd || process.cwd();
  const project = aodProject(cwd);
  if (!project || project.config.guards?.contracts === false) return;
  const filePath = input.tool_input?.file_path || input.tool_input?.notebook_path;
  if (typeof filePath !== 'string') return;
  const reason = check(project, filePath, cwd);
  if (reason) block(reason);
});
