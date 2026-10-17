// aod delegate | revise | gates | merge | reject
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execArgs, foldEvent, locateCodex, needsShell, resumeArgs } from '../lib/codex.mjs';
import { matchesAny, normalizePath } from '../lib/glob.mjs';
import { integrityChecks } from '../lib/integrity.mjs';
import {
  TEMPLATES, assertTaskId, codexBranch, getTask, loadIndex, openProject, readJson, readPacket, requireInitialized,
  schema, taskBranch, updateTask, writeJson,
} from '../lib/project.mjs';
import { validate } from '../lib/schema.mjs';
import { AodError, branchExists, git, isClean, now, sh } from '../lib/proc.mjs';
import { pickSlot, resetSlot, runningJobs } from './setup.mjs';

export const EXIT = { OK: 0, FAIL: 1, USAGE: 2, BLOCKED: 3, ESCALATE: 4 };

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const bullets = (xs) => (xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- none');
const numbered = (xs) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n');

export function forbiddenFor(project, packet) {
  return [...project.config.forbidden_always, ...(packet.forbidden || [])];
}

export function buildBrief(project, packet) {
  const readFirst = ['AGENTS.md', '.agents/context/invariants.md', project.packetRel(packet.id), ...(packet.contracts || [])];
  if (packet.spec && packet.spec !== 'none') readFirst.push(packet.spec);
  return fill(readFileSync(join(TEMPLATES, 'brief.md'), 'utf8'), {
    project: basename(project.root),
    id: packet.id,
    title: packet.title,
    packet_path: project.packetRel(packet.id),
    read_first: bullets(readFirst),
    scope: bullets(packet.scope),
    forbidden: bullets(forbiddenFor(project, packet)),
    constraints: bullets(packet.constraints),
    acceptance: numbered(packet.acceptance),
  });
}

// Spawn codex, stream JSONL, enforce budget and idle timeouts. Resolves with the job state.
function runCodex(project, { id, slot, args, cwd, brief, budgetMinutes, kind }) {
  const cmd = locateCodex(project.config);
  if (!cmd) {
    throw new AodError('Codex CLI not found. Install it (npm i -g @openai/codex) and run `codex login`, '
      + 'or set codex.command in .agents/aod.config.json.');
  }
  const dir = project.jobDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, kind === 'revise' ? 'revision.md' : 'brief.md'), brief);
  const events = createWriteStream(join(dir, 'events.jsonl'), { flags: 'a' });
  const stderr = createWriteStream(join(dir, 'stderr.log'), { flags: 'a' });
  const { timeouts } = project.config;
  const budgetMs = budgetMinutes * timeouts.budget_factor * 60_000;
  const idleMs = timeouts.idle_minutes * 60_000;

  return new Promise((resolve) => {
    const child = spawn(cmd[0], [...cmd.slice(1), ...args], { cwd, shell: needsShell(cmd), stdio: ['pipe', 'pipe', 'pipe'] });
    const state = {
      task_id: id, kind, slot, pid: child.pid, status: 'running', started: now(),
      main_head: git(['rev-parse', 'HEAD'], project.root),
    };
    const prev = existsSync(join(dir, 'state.json')) ? readJson(join(dir, 'state.json')) : {};
    state.thread_id = prev.thread_id || null;
    writeJson(join(dir, 'state.json'), state);

    let killedFor = null;
    let lastActivity = Date.now();
    const kill = (why) => {
      killedFor = why;
      child.kill();
    };
    const budgetTimer = setTimeout(() => kill(`budget exceeded (${Math.round(budgetMs / 60000)} min)`), budgetMs);
    const idleTimer = setInterval(() => {
      if (Date.now() - lastActivity > idleMs) kill(`no activity for ${timeouts.idle_minutes} min`);
    }, Math.min(idleMs, 30_000));

    let buf = '';
    child.stdout.on('data', (chunk) => {
      lastActivity = Date.now();
      events.write(chunk);
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) foldEvent(state, line);
      writeJson(join(dir, 'state.json'), state);
    });
    child.stderr.on('data', (chunk) => {
      lastActivity = Date.now();
      stderr.write(chunk);
    });
    child.on('error', (e) => {
      state.error = e.message;
    });
    child.on('close', (code) => {
      clearTimeout(budgetTimer);
      clearInterval(idleTimer);
      if (buf) foldEvent(state, buf);
      events.end();
      stderr.end();
      Object.assign(state, { status: 'finished', exit_code: code, ended: now() });
      if (killedFor) state.error = `killed: ${killedFor}`;
      writeJson(join(dir, 'state.json'), state);
      resolve(state);
    });
    child.stdin.end(brief);
  });
}

function readReport(project, id) {
  const p = join(project.jobDir(id), 'report.json');
  if (!existsSync(p)) return { report: null, errors: ['report.json was not written'] };
  let report;
  try {
    report = readJson(p);
  } catch (e) {
    return { report: null, errors: [`report.json is not valid JSON: ${e.message}`] };
  }
  const errors = validate(schema('report'), report);
  if (report.task_id !== id) errors.push(`task_id is "${report.task_id}", expected "${id}"`);
  if ((report.summary || '').length > 600) errors.push('summary longer than 600 characters');
  return { report, errors };
}

function addUsage(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
}

// Codex's workspace-write sandbox keeps .git read-only, so the implementer cannot commit (ADR-0002).
// AOD commits whatever the implementer left in the slot; the scope gate then judges every file.
export function commitSlotChanges(slotPath, message) {
  if (isClean(slotPath)) return null;
  git(['add', '-A'], slotPath);
  git(['commit', '-q', '--no-verify', '--author', 'Codex (AOD implementer) <codex@aod.invalid>', '-m', message], slotPath);
  return git(['rev-parse', '--short', 'HEAD'], slotPath);
}

function finishJob(project, id, state, commitMessage) {
  const { report, errors } = readReport(project, id);
  const committed = state.exit_code === 0 && report && report.status !== 'blocked'
    ? commitSlotChanges(project.slotPath(state.slot), commitMessage)
    : null;
  let status = 'review';
  let exit = EXIT.OK;
  if (state.exit_code !== 0 || state.error || !report) {
    status = 'failed';
    exit = EXIT.FAIL;
  } else if (report.status === 'blocked') {
    status = 'blocked';
    exit = EXIT.BLOCKED;
  } else if (report.status === 'failed') {
    status = 'failed';
    exit = EXIT.FAIL;
  }
  const task = updateTask(project, id, (t) => ({
    status, thread_id: state.thread_id || t.thread_id, usage: addUsage(t.usage, state.usage),
    failures: (t.failures || 0) + (status === 'failed' ? 1 : 0),
  }));
  return {
    exit,
    result: {
      id, status, slot: state.slot, committed, exit_code: state.exit_code, error: state.error || null, thread_id: state.thread_id,
      usage: state.usage || null, report_status: report?.status || null, report_errors: errors,
      summary: report?.summary || null, open_questions: report?.open_questions || [],
      failures: task.failures,
      next: status === 'review' ? `aod gates ${id}` : status === 'blocked' ? 'answer the question, then aod revise'
        : task.failures >= 2 ? `second failed job: aod reject ${id} and split the task` : 'inspect stderr.log and the slot, fix the environment, then retry',
    },
  };
}

export async function delegate({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const index = loadIndex(project);
  const task = getTask(index, id);
  if (task.status !== 'ready' && !flags.force) {
    throw new AodError(`${id} is "${task.status}", not "ready"; run /aod:preflight first (or pass --force)`);
  }
  for (const dep of task.depends_on || []) {
    if (getTask(index, dep).status !== 'done') throw new AodError(`${id} depends on ${dep}, which is not done`);
  }
  if (!branchExists(project.root, taskBranch(id))) throw new AodError(`${taskBranch(id)} does not exist; run aod task commit ${id}`);
  if (branchExists(project.root, codexBranch(id))) throw new AodError(`${codexBranch(id)} already exists; use aod revise or aod reject`);
  const { data: packet } = readPacket(project, id);
  const slot = pickSlot(project, flags.slot);
  git(['switch', '-c', codexBranch(id), taskBranch(id)], slot.path);

  const model = flags.model || packet.model || project.config.codex.model || null;
  const effort = flags.effort || packet.effort || project.config.codex.effort || null;
  updateTask(project, id, { status: 'in_progress', slot: slot.name, model, effort, started: now() });

  const state = await runCodex(project, {
    id, slot: slot.name, cwd: slot.path, kind: 'delegate', budgetMinutes: packet.budget_minutes,
    brief: buildBrief(project, packet),
    args: execArgs({
      slot: slot.path, model, effort, sandbox: project.config.codex.sandbox,
      schemaPath: join(TEMPLATES, 'schemas', 'report.schema.json'), outPath: join(project.jobDir(id), 'report.json'),
    }),
  });
  return finishJob(project, id, state, `${id}: ${packet.title}`);
}

export async function revise({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const task = getTask(loadIndex(project), id);
  if (!task.thread_id || !task.slot) throw new AodError(`${id} has no Codex thread to resume; delegate it first`);
  if (runningJobs(project).some((j) => j.task_id === id)) throw new AodError(`${id} already has a running job`);
  const findings = flags.findings ? readFileSync(flags.findings, 'utf8').trim() : null;
  if (!findings) throw new AodError('usage: aod revise T-xxxx --findings <file> (one finding per line: F1 [blocker] path:line - ...)', 2);
  const round = task.rounds + 1;
  const verdict = flags.answer ? [] : ['REVISE'];
  if (round > project.config.max_rounds && !flags.answer) {
    updateTask(project, id, { status: 'escalated', verdicts: [...(task.verdicts || []), 'REVISE'] });
    return { exit: EXIT.ESCALATE, result: { id, status: 'escalated', reason: `round limit ${project.config.max_rounds} reached`, next: 'escalate to the PO: task, disagreement, options, recommendation' } };
  }
  const { data: packet } = readPacket(project, id);
  const brief = flags.answer
    ? `<answer task="${id}">\n${findings}\n</answer>\nContinue task ${id}. All rules of the original brief still apply. `
      + `Answer only with the JSON report (task_id "${id}").`
    : fill(readFileSync(join(TEMPLATES, 'revision.md'), 'utf8'), { id, round: String(round), findings });
  updateTask(project, id, {
    status: 'in_progress', rounds: flags.answer ? task.rounds : round, verdicts: [...(task.verdicts || []), ...verdict],
  });
  const slotPath = project.slotPath(task.slot);
  const state = await runCodex(project, {
    id, slot: task.slot, cwd: slotPath, kind: 'revise', budgetMinutes: packet.budget_minutes, brief,
    args: resumeArgs({
      threadId: task.thread_id, model: task.model, effort: task.effort,
      schemaPath: join(TEMPLATES, 'schemas', 'report.schema.json'), outPath: join(project.jobDir(id), 'report.json'),
    }),
  });
  return finishJob(project, id, state, flags.answer ? `${id}: continue after answer` : `${id}: address review round ${round}`);
}

// ---- gates ----

export function changedFiles(slotPath, id) {
  return git(['diff', '--name-only', `${taskBranch(id)}...${codexBranch(id)}`], slotPath).split('\n').filter(Boolean).map(normalizePath);
}

export function scopeViolations(files, scope, forbidden) {
  const out = [];
  for (const f of files) {
    if (matchesAny(f, forbidden)) out.push(`${f} (forbidden)`);
    else if (!matchesAny(f, scope)) out.push(`${f} (outside scope)`);
  }
  return out;
}

export { skipMarkers } from '../lib/integrity.mjs';

// Acceptance test sources added on task/T-xxxx, for the special-casing heuristic.
function acceptanceSources(project, id) {
  const files = git(['diff', '--name-only', `${project.config.base_branch}...${taskBranch(id)}`], project.root)
    .split('\n').filter(Boolean).filter((f) => matchesAny(f, project.config.protected || []));
  return files.map((f) => git(['show', `${taskBranch(id)}:${f}`], project.root, { allowFail: true }).out || '');
}

export function gates({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const task = getTask(loadIndex(project), id);
  if (!task.slot) throw new AodError(`${id} has not been delegated`);
  const slotPath = project.slotPath(task.slot);
  const { data: packet } = readPacket(project, id);
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, level: ok ? 'pass' : 'fail', detail });

  const commits = git(['log', '--oneline', `${taskBranch(id)}..${codexBranch(id)}`], slotPath).split('\n').filter(Boolean);
  check('commits', commits.length > 0, commits.length ? `${commits.length} commit(s)` : 'no commits on the implementer branch');
  check('slot-clean', isClean(slotPath), isClean(slotPath) ? 'clean' : 'uncommitted changes in the slot');
  const slotHead = git(['rev-parse', 'HEAD'], slotPath);
  const branchHead = git(['rev-parse', codexBranch(id)], slotPath);
  check('slot-head', slotHead === branchHead,
    slotHead === branchHead ? `at ${codexBranch(id)}` : `slot HEAD is not ${codexBranch(id)}; run git -C <slot> switch ${codexBranch(id)}`);

  const files = changedFiles(slotPath, id);
  const violations = scopeViolations(files, packet.scope, forbiddenFor(project, packet));
  check('scope', violations.length === 0, violations.length ? violations.join('; ') : `${files.length} file(s) in scope`);

  const range = `${taskBranch(id)}...${codexBranch(id)}`;
  results.push(...integrityChecks({
    diffText: git(['diff', '-U0', range], slotPath),
    nameStatus: git(['diff', '--name-status', '-M', range], slotPath),
    testGlobs: project.config.test_globs || [],
    acceptanceSources: acceptanceSources(project, id),
  }));

  const { report, errors } = readReport(project, id);
  check('report', errors.length === 0 && report?.status === 'done',
    errors.length ? errors.join('; ') : `status ${report.status}`);

  const acceptance = packet.acceptance.map((cmd) => sh(cmd, slotPath));
  for (const a of acceptance) check(`acceptance: ${a.cmd}`, a.exit_code === 0, a.exit_code === 0 ? 'exit 0' : `exit ${a.exit_code}\n${a.tail}`);

  const ok = results.every((r) => r.ok || r.level === 'warn');
  const warnings = results.filter((r) => r.level === 'warn').map((r) => `${r.name}: ${r.detail}`);
  const head = git(['rev-parse', codexBranch(id)], slotPath);
  writeJson(join(project.jobDir(id), 'gates.json'), { task_id: id, head, ok, at: now(), results });
  return { exit: ok ? EXIT.OK : EXIT.FAIL, result: { id, ok, head, warnings, results, next: ok ? `fresh-context review${warnings.length ? ' (give the reviewer the warnings)' : ''}, then aod merge` : 'aod revise with findings' } };
}

// ---- merge / reject ----

// Ledger policy: index.json/md may be dirty on the base branch; aod merge commits them with the task.
function unexpectedDirt(root, allowed = []) {
  const lines = git(['status', '--porcelain', '--untracked-files=all'], root).split('\n').filter(Boolean);
  return lines.filter((l) => {
    // git() trims output, so the first line may have lost its leading status space.
    const p = l.replace(/^[ MADRCUT?!]{1,2} /, '').replace(/^"|"$/g, '');
    return !/^\.agents\/tasks\/index\.(json|md)$/.test(p) && !allowed.includes(p);
  });
}

export function merge({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { root, config } = project;
  const task = getTask(loadIndex(project), id);
  const gatesPath = join(project.jobDir(id), 'gates.json');
  if (!existsSync(gatesPath)) throw new AodError(`run aod gates ${id} first`);
  const gate = readJson(gatesPath);
  const head = git(['rev-parse', codexBranch(id)], root);
  if (!gate.ok) throw new AodError(`gates failed for ${id}; fix before merging`);
  if (gate.head !== head) throw new AodError(`${codexBranch(id)} moved since gates ran; run aod gates ${id} again`);
  if (git(['branch', '--show-current'], root) !== config.base_branch) throw new AodError(`main checkout must be on ${config.base_branch}`);
  const journal = flags.journal ? [String(flags.journal).replace(/\\/g, '/')] : [];
  for (const j of journal) {
    if (!/^\.agents\/journal\/[^/]+\.md$/.test(j)) throw new AodError(`--journal must be a file in .agents/journal/, got ${j}`, 2);
    if (!existsSync(join(root, j))) throw new AodError(`${j} does not exist`);
  }
  const dirty = unexpectedDirt(root, journal);
  if (dirty.length) throw new AodError(`main checkout has uncommitted changes:\n  ${dirty.join('\n  ')}`);
  const slotPath = project.slotPath(task.slot);
  if (!isClean(slotPath) || git(['rev-parse', 'HEAD'], slotPath) !== head) {
    throw new AodError(`slot ${task.slot} changed after gates (dirty or not at ${codexBranch(id)}); restore it or run aod gates ${id} again`);
  }
  const probe = git(['merge-tree', '--write-tree', config.base_branch, codexBranch(id)], root, { allowFail: true });
  if (!probe.ok) throw new AodError(`${codexBranch(id)} conflicts with ${config.base_branch}:\n${probe.out}`);

  git(['merge', '--squash', codexBranch(id)], root);
  const reportSrc = join(project.jobDir(id), 'report.json');
  const reportRel = `.agents/tasks/${id}.report.json`;
  copyFileSync(reportSrc, join(root, reportRel));
  updateTask(project, id, (t) => ({
    status: 'done', finished: now(), verdicts: [...(t.verdicts || []), 'ACCEPT'],
    ...(flags.attention ? { attention_minutes: Number(flags.attention) } : {}),
  }));
  git(['add', '--', reportRel, '.agents/tasks/index.json', '.agents/tasks/index.md', ...journal], root);
  const trailers = [`Implemented-by: codex${task.model ? ` (${task.model})` : ''}`];
  if (flags['reviewed-by']) trailers.push(`Reviewed-by: ${flags['reviewed-by']}`);
  git(['commit', '-m', `${id}: ${task.title}`, '-m', trailers.join('\n')], root);
  const sha = git(['rev-parse', '--short', 'HEAD'], root);

  const slot = resetSlot(project, task.slot);
  if (flags.prune) {
    git(['branch', '-D', codexBranch(id), taskBranch(id)], root);
  }
  return { exit: EXIT.OK, result: { id, merged: sha, journal: journal[0] || null, slot: `${slot.name} reset to ${config.base_branch}`, pruned: !!flags.prune } };
}

export function reject({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const task = getTask(loadIndex(project), id);
  if (task.slot) resetSlot(project, task.slot, { force: true });
  if (branchExists(project.root, codexBranch(id))) git(['branch', '-D', codexBranch(id)], project.root);
  updateTask(project, id, (t) => ({
    status: flags.cancel ? 'cancelled' : 'ready', slot: null, thread_id: null, verdicts: [...(t.verdicts || []), 'REJECT'],
  }));
  return { exit: EXIT.OK, result: { id, status: flags.cancel ? 'cancelled' : 'ready', next: 'rewrite the packet or split the task, then delegate again' } };
}
