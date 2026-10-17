#!/usr/bin/env node
// SessionStart: brief the architect from the repo (journal next step, open tasks, slots); after compaction,
// re-inject the invariants so red lines survive long sessions.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadIndex } from '../lib/project.mjs';
import { runningJobs, slotInfo } from '../commands/setup.mjs';
import { activeUnlock } from './contract-guard.mjs';
import { aodProject, run } from './common.mjs';

const cap = (s, n) => (s.length > n ? `${s.slice(0, n)}\n[...truncated]` : s);

export function latestJournal(project) {
  const dir = join(project.agents, 'journal');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(f)).sort();
  if (!files.length) return null;
  const file = files[files.length - 1];
  const text = readFileSync(join(dir, file), 'utf8');
  const m = /^## Next step\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  return { file, next: m ? m[1].trim() : null };
}

export function briefing(project, source) {
  const lines = [`AOD briefing for ${basename(project.root)} (architect session; use the /aod:* skills).`];
  const j = latestJournal(project);
  if (j) lines.push(`Last journal: .agents/journal/${j.file}`, `Next step: ${j.next ? cap(j.next, 800) : '(none recorded)'}`);
  else lines.push('No journal entries yet.');

  const index = loadIndex(project);
  const open = index.tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  lines.push(open.length
    ? `Open tasks:\n${open.map((t) => `- ${t.id} ${t.status}${t.slot ? ` in ${t.slot}` : ''}${t.rounds ? `, round ${t.rounds}` : ''}: ${t.title}`).join('\n')}`
    : 'Open tasks: none.');

  const running = runningJobs(project);
  if (running.length) lines.push(`Running Codex jobs: ${running.map((r) => `${r.task_id} (${r.slot})`).join(', ')}`);
  const slots = project.slotNames().map((n) => slotInfo(project, n)).filter((s) => s.exists);
  if (slots.length) lines.push(`Slots: ${slots.map((s) => `${s.name} ${s.free ? 'free' : `${s.branch}${s.clean ? '' : ' (dirty)'}`}`).join(', ')}`);

  const u = activeUnlock(project);
  if (u) lines.push(`Contracts are UNLOCKED until ${u.until} (${u.reason}); run \`aod lock\` when done.`);

  if (source === 'compact') {
    const inv = join(project.agents, 'context', 'invariants.md');
    if (existsSync(inv)) lines.push(`Invariants (re-injected after compaction):\n${cap(readFileSync(inv, 'utf8').trim(), 3000)}`);
  }
  return lines.join('\n');
}

run(import.meta.url, (input) => {
  const project = aodProject(input.cwd || process.cwd());
  if (!project) return;
  const additionalContext = briefing(project, input.source);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
});
