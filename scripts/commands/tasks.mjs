// aod packet new|validate, aod task commit|set
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEMPLATES, assertTaskId, checkPacket, loadIndex, newTaskRecord, openProject, readPacketText, requireInitialized,
  saveIndex, taskBranch, taskId, updateTask,
} from '../lib/project.mjs';
import { AodError, branchExists, git } from '../lib/proc.mjs';

const STATUSES = ['planned', 'ready', 'in_progress', 'review', 'blocked', 'done', 'failed', 'escalated', 'cancelled'];

export function packetNew({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const title = args.join(' ').trim();
  if (!title) throw new AodError('usage: aod packet new "<imperative title>" [--owner codex|claude] [--milestone M1]', 2);
  const index = loadIndex(project);
  const id = taskId(index.next_id);
  const owner = flags.owner || 'codex';
  const text = readFileSync(join(TEMPLATES, 'agents', 'tasks', 'template.md'), 'utf8')
    .replace('{id}', id)
    .replace('{title}', title.replace(/:/g, ' -'))
    .replace(/^owner: codex$/m, `owner: ${owner}`)
    .replace(/^milestone: M0$/m, `milestone: ${flags.milestone || 'M0'}`);
  const path = project.packetPath(id);
  if (existsSync(path)) throw new AodError(`${path} already exists`);
  writeFileSync(path, text);
  index.tasks.push(newTaskRecord(id, title, { owner, milestone: flags.milestone || 'M0' }));
  index.next_id += 1;
  saveIndex(project, index);
  return { id, packet: project.packetRel(id), next: 'Fill in scope, acceptance and context, then `aod task commit`' };
}

export function packetValidate({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { errors, data } = checkPacket(readPacketText(project, id), id);
  const index = loadIndex(project);
  for (const dep of data?.depends_on || []) {
    if (!index.tasks.some((t) => t.id === dep)) errors.push(`depends_on ${dep} is not in index.json`);
  }
  if (errors.length) throw new AodError(`packet ${id} is invalid:\n  ${errors.join('\n  ')}`);
  return { id, valid: true, scope: data.scope, acceptance: data.acceptance };
}

// Print the packet wherever it lives (working tree or task branch); avoids `git show branch:path`,
// which Git Bash on Windows mangles.
export function packetShow({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  return { raw: readPacketText(project, assertTaskId(args[0])) };
}

// Bring a committed packet back into the working tree for editing; `aod task commit` then amends the branch.
export function packetRestore({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const path = project.packetPath(id);
  if (existsSync(path)) throw new AodError(`${project.packetRel(id)} is already in the working tree`);
  writeFileSync(path, `${readPacketText(project, id).replace(/\s*$/, '')}\n`);
  return { id, restored: project.packetRel(id), next: `edit it, then aod task commit ${id} [changed test paths...]` };
}

// Commit packet + acceptance tests onto task/T-xxxx without touching the base branch or switching branches:
// a temporary index builds the commit, then the files leave the main working tree (they live on task/T-xxxx).
// Run again with edited files to add a fix-up commit to an existing task branch.
export function taskCommit({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { root, config } = project;
  const packetRel = project.packetRel(id);
  if (!existsSync(project.packetPath(id))) {
    throw new AodError(`${packetRel} is not in the working tree; restore it with \`git show ${taskBranch(id)}:${packetRel}\` and edit it`);
  }
  packetValidate({ cwd, args: [id] });
  const paths = [packetRel, ...args.slice(1)].map((p) => p.replace(/\\/g, '/'));
  for (const p of paths) if (!existsSync(join(root, p))) throw new AodError(`${p} does not exist`);

  const branch = taskBranch(id);
  const parent = git(['rev-parse', branchExists(root, branch) ? branch : config.base_branch], root);
  const gitDir = git(['rev-parse', '--absolute-git-dir'], root);
  const env = { GIT_INDEX_FILE: join(gitDir, `aod-index-${id}`) };
  try {
    git(['read-tree', parent], root, { env });
    git(['add', '--', ...paths], root, { env });
    const tree = git(['write-tree'], root, { env });
    if (tree === git(['rev-parse', `${parent}^{tree}`], root)) throw new AodError('nothing to commit for this task');
    const commit = git(['commit-tree', tree, '-p', parent, '-m', `${id}: packet and acceptance tests`], root);
    git(['update-ref', `refs/heads/${branch}`, commit], root);
  } finally {
    rmSync(env.GIT_INDEX_FILE, { force: true });
  }
  // Files untracked on the base branch would block the squash merge later; remove them from the working tree.
  const removed = [];
  for (const p of paths) {
    if (!git(['ls-files', '--error-unmatch', '--', p], root, { allowFail: true }).ok) {
      rmSync(join(root, p), { force: true });
      removed.push(p);
    }
  }
  return { id, branch, committed: paths, moved_off_base: removed, next: `Run /aod:preflight, then \`aod task set ${id} status=ready\`` };
}

export function taskSet({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const patch = {};
  for (const pair of args.slice(1)) {
    const [k, ...rest] = pair.split('=');
    const v = rest.join('=');
    if (k === 'status') {
      if (!STATUSES.includes(v)) throw new AodError(`status must be one of ${STATUSES.join(', ')}`, 2);
      patch.status = v;
    } else if (k === 'notes') patch.notes = v;
    else if (k === 'attention_minutes') patch.attention_minutes = Number(v);
    else throw new AodError(`cannot set "${k}" (status|notes|attention_minutes)`, 2);
  }
  return updateTask(project, id, patch);
}
