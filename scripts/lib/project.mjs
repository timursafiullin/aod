// Project context: repository root, config, ledger (index.json) and task packets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './frontmatter.mjs';
import { validate } from './schema.mjs';
import { AodError, git, now } from './proc.mjs';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATES = join(PLUGIN_ROOT, 'templates');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
};
export const schema = (name) => readJson(join(TEMPLATES, 'schemas', `${name}.schema.json`));

export function taskId(n) {
  return `T-${String(n).padStart(4, '0')}`;
}

export function assertTaskId(id) {
  if (!/^T-\d{4}$/.test(id || '')) throw new AodError(`invalid task id "${id}" (expected T-0001)`, 2);
  return id;
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] ? deepMerge(base[k], v) : v;
  }
  return out;
}

// Main checkout root, also when called from inside a worktree slot.
export function findRoot(cwd = process.cwd()) {
  const res = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd, { allowFail: true });
  if (!res.ok) throw new AodError('not inside a git repository (run `git init` first)');
  return resolve(dirname(res.out));
}

export function openProject(cwd = process.cwd()) {
  const root = findRoot(cwd);
  const agents = join(root, '.agents');
  const configPath = join(agents, 'aod.config.json');
  const defaults = readJson(join(TEMPLATES, 'aod.config.json'));
  const config = deepMerge(defaults, existsSync(configPath) ? readJson(configPath) : {});
  const worktrees = resolve(root, config.worktrees_dir.replace('{repo}', basename(root)));

  const project = {
    root,
    config,
    configPath,
    agents,
    initialized: existsSync(configPath),
    tasksDir: join(agents, 'tasks'),
    indexPath: join(agents, 'tasks', 'index.json'),
    worktrees,
    packetRel: (id) => `.agents/tasks/${id}.md`,
    packetPath: (id) => join(agents, 'tasks', `${id}.md`),
    jobDir: (id) => join(agents, 'tasks', 'jobs', id),
    slotPath: (name) => join(worktrees, name),
    slotNames: () => Array.from({ length: config.slots }, (_, i) => `codex-${i + 1}`),
  };
  return project;
}

export function requireInitialized(project) {
  if (!project.initialized) throw new AodError('AOD is not initialised here; run `aod init` (or /aod-init) first');
  return project;
}

// ---- ledger ----

export function loadIndex(project) {
  if (!existsSync(project.indexPath)) return { version: 1, next_id: 1, tasks: [] };
  const index = readJson(project.indexPath);
  const errors = validate(schema('index'), index);
  if (errors.length) throw new AodError(`index.json is invalid:\n  ${errors.join('\n  ')}`);
  return index;
}

export function renderIndexMd(index) {
  const rows = index.tasks.map((t) => {
    const usage = t.usage ? `${Math.round(((t.usage.input_tokens || 0) + (t.usage.output_tokens || 0)) / 1000)}k tok` : '';
    const cells = [t.id, t.title, t.owner, t.milestone || '', t.status, t.model || '', String(t.rounds),
      (t.verdicts || []).join(' '), usage, t.notes || ''];
    return `| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
  });
  return [
    '# Tasks',
    '',
    'Generated from `index.json` by `aod index render`. Do not edit by hand.',
    '',
    '| ID | Title | Owner | Milestone | Status | Model | Rounds | Verdicts | Usage | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Next id: ${taskId(index.next_id)}`,
    '',
  ].join('\n');
}

export function saveIndex(project, index) {
  const errors = validate(schema('index'), index);
  if (errors.length) throw new AodError(`refusing to write invalid index.json:\n  ${errors.join('\n  ')}`);
  writeJson(project.indexPath, index);
  writeFileSync(join(project.tasksDir, 'index.md'), renderIndexMd(index));
}

export function getTask(index, id) {
  const task = index.tasks.find((t) => t.id === id);
  if (!task) throw new AodError(`task ${id} is not in index.json`);
  return task;
}

export function updateTask(project, id, patch) {
  const index = loadIndex(project);
  const task = getTask(index, id);
  Object.assign(task, typeof patch === 'function' ? patch(task) : patch);
  saveIndex(project, index);
  return task;
}

export function newTaskRecord(id, title, extra = {}) {
  return {
    id, title, owner: 'codex', status: 'planned', depends_on: [], slot: null, thread_id: null,
    model: null, effort: null, rounds: 0, verdicts: [], created: now(), started: null, finished: null, ...extra,
  };
}

// ---- packets ----

export function taskBranch(id) {
  return `task/${id}`;
}
export function codexBranch(id) {
  return `codex/${id}`;
}

export function readPacketText(project, id) {
  const p = project.packetPath(id);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  const res = git(['show', `${taskBranch(id)}:${project.packetRel(id)}`], project.root, { allowFail: true });
  if (res.ok) return res.out;
  throw new AodError(`packet ${id} not found in the working tree or on ${taskBranch(id)}`);
}

export function checkPacket(text, id) {
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (e) {
    return { errors: [e.message] };
  }
  const errors = validate(schema('packet'), parsed.data);
  if (id && parsed.data.id !== id) errors.push(`$.id: is "${parsed.data.id}", expected "${id}"`);
  return { errors, data: parsed.data, body: parsed.body };
}

export function readPacket(project, id) {
  const { errors, data, body } = checkPacket(readPacketText(project, id), id);
  if (errors.length) throw new AodError(`packet ${id} is invalid:\n  ${errors.join('\n  ')}`);
  return { data, body };
}
