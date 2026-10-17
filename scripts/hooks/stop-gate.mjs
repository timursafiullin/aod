#!/usr/bin/env node
// Stop: "done means green". When enabled in aod.config.json (stop_gate), the architect cannot end a turn with
// uncommitted changes in the main checkout while the configured checks fail.
import { git, sh } from '../lib/proc.mjs';
import { aodProject, block, run } from './common.mjs';

const IGNORED = /^\.agents\/(tasks\/index\.(json|md)|journal\/)/;

export function changedPaths(root) {
  return git(['status', '--porcelain', '--untracked-files=all'], root)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.replace(/^[ MADRCUT?!]{1,2} /, '').replace(/^"|"$/g, ''))
    .filter((p) => !IGNORED.test(p));
}

export function gate(project) {
  const cfg = project.config.stop_gate || {};
  if (!cfg.enabled || !cfg.commands?.length) return null;
  if (!changedPaths(project.root).length) return null;
  const timeout = (cfg.timeout_minutes || 10) * 60_000;
  for (const cmd of cfg.commands) {
    const r = sh(cmd, project.root, timeout);
    if (r.exit_code !== 0) {
      return `checks are red, so the work is not done: \`${cmd}\` exited ${r.exit_code}.\n${r.tail.slice(-1500)}\n`
        + 'Fix the failure, or tell the user plainly why you are stopping with red checks.';
    }
  }
  return null;
}

run(import.meta.url, (input) => {
  if (input.stop_hook_active) return; // already continued once because of this hook; never loop
  const project = aodProject(input.cwd || process.cwd());
  if (!project) return;
  const reason = gate(project);
  if (reason) block(reason);
});
