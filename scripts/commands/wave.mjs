// aod wave plan | run: delegate independent tasks in parallel, one per slot (ADR-0007).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, checkPacket, codexBranch, loadIndex, openProject, readPacketText, requireInitialized, taskBranch } from '../lib/project.mjs';
import { AodError, branchExists } from '../lib/proc.mjs';
import { globsOverlap } from './preflight.mjs';
import { EXIT, requireCodex } from './run.mjs';
import { createSlot, slotInfo } from './setup.mjs';

const ACTIVE = ['in_progress', 'review', 'blocked', 'failed', 'escalated'];

function packetOf(project, id) {
  try {
    const { errors, data } = checkPacket(readPacketText(project, id), id);
    return errors.length ? null : data;
  } catch {
    return null;
  }
}

// A wave: ready Codex tasks whose dependencies are done and whose scopes overlap neither each other nor any task
// that still holds a slot, at most one per free slot. Greedy in id order, so earlier tasks win a conflict.
export function planWave(project, { max } = {}) {
  if (max !== undefined && !(Number(max) >= 1)) throw new AodError('--max must be a positive number', 2);
  const index = loadIndex(project);
  const byId = new Map(index.tasks.map((t) => [t.id, t]));
  const freeSlots = project.slotNames().filter((n) => !existsSync(project.slotPath(n)) || slotInfo(project, n).free);
  const limit = Math.min(freeSlots.length, Number(max) || Infinity);
  const taken = index.tasks.filter((t) => ACTIVE.includes(t.status)).map((t) => ({ id: t.id, scope: packetOf(project, t.id)?.scope || [] }));
  const wave = [];
  const deferred = [];
  for (const t of index.tasks.filter((x) => x.status === 'ready' && x.owner === 'codex')) {
    const defer = (reason) => deferred.push({ id: t.id, reason });
    const packet = packetOf(project, t.id);
    if (!packet) { defer('packet is missing or invalid'); continue; }
    const deps = new Set([...(t.depends_on || []), ...(packet.depends_on || [])]);
    const openDeps = [...deps].filter((d) => byId.get(d)?.status !== 'done');
    if (openDeps.length) { defer(`depends on ${openDeps.join(', ')}`); continue; }
    if (!branchExists(project.root, taskBranch(t.id))) { defer(`no ${taskBranch(t.id)}; run aod task commit`); continue; }
    if (branchExists(project.root, codexBranch(t.id))) { defer(`${codexBranch(t.id)} exists; revise or reject it`); continue; }
    const { scope } = packet;
    const clash = taken.find((o) => globsOverlap(scope, o.scope));
    if (clash) { defer(`scope overlaps ${clash.id}`); continue; }
    if (wave.length >= limit) { defer('no free slot in this wave'); continue; }
    wave.push({ id: t.id, title: t.title, slot: freeSlots[wave.length], scope });
    taken.push({ id: t.id, scope });
  }
  const nextWave = Math.max(0, ...index.tasks.map((t) => t.wave || 0)) + 1;
  return { wave_number: nextWave, wave, deferred, free_slots: freeSlots };
}

export function wavePlan({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  const plan = planWave(project, flags);
  return {
    ...plan,
    next: plan.wave.length ? `aod wave run${flags.max ? ` --max ${flags.max}` : ''} (in the background)`
      : 'nothing to run: preflight more tasks, or close reviewed tasks to free slots',
  };
}

function runChild(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(PLUGIN_ROOT, 'scripts', 'aod.mjs'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('close', (code) => {
      let result = null;
      try {
        result = JSON.parse(out);
      } catch { /* not JSON: keep the text */ }
      resolve({ exit: code, result, error: result ? null : (err || out).trim().slice(-1500) });
    });
  });
}

export async function waveRun({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  requireCodex(project);
  const plan = planWave(project, flags);
  if (!plan.wave.length) return { exit: EXIT.OK, result: { ...plan, ran: [], next: 'nothing to run' } };
  // Slots are created one by one first: concurrent `git worktree add` calls race on the repository config.
  for (const w of plan.wave) createSlot(project, w.slot);
  const started = Date.now();
  const runs = await Promise.all(plan.wave.map((w) => runChild(
    ['delegate', w.id, '--slot', w.slot, '--wave', String(plan.wave_number)], project.root,
  ).then((r) => ({ id: w.id, slot: w.slot, ...r }))));
  const ran = runs.map((r) => ({
    id: r.id, slot: r.slot, exit: r.exit, status: r.result?.status || 'failed', next: r.result?.next || null,
    ...(r.result?.summary ? { summary: r.result.summary } : {}),
    ...(r.result?.open_questions?.length ? { open_questions: r.result.open_questions } : {}),
    ...(r.error ? { error: r.error } : {}),
  }));
  const unavailable = ran.some((r) => r.exit === EXIT.UNAVAILABLE);
  const exit = unavailable ? EXIT.UNAVAILABLE : ran.every((r) => r.exit === EXIT.OK) ? EXIT.OK : EXIT.FAIL;
  return {
    exit,
    result: {
      wave_number: plan.wave_number, elapsed_minutes: Math.round((Date.now() - started) / 6000) / 10, ran, deferred: plan.deferred,
      next: unavailable ? 'Codex is unavailable or out of quota: stop and ask the user (ADR-0006)'
        : 'verify each task in review one at a time (/aod:verify), merge, then plan the next wave',
    },
  };
}
