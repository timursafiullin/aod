// aod packet new|validate, aod task commit|set
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEMPLATES, assertTaskId, checkPacket, loadIndex, newTaskRecord, openProject, readPacketText, requireInitialized,
  saveIndex, taskBranch, taskId, updateTask, withIndexLock,
} from '../lib/project.mjs';
import { AodError, branchExists, git } from '../lib/proc.mjs';

const STATUSES = ['planned', 'ready', 'in_progress', 'review', 'blocked', 'done', 'failed', 'escalated', 'cancelled'];

export function packetNew({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const title = args.join(' ').trim();
  if (!title) throw new AodError('usage: aod packet new "<imperative title>" [--owner codex|claude] [--milestone M1]', 2);
  const owner = flags.owner || 'codex';
  const id = withIndexLock(project, () => {
    const index = loadIndex(project);
    const next = taskId(index.next_id);
    const text = readFileSync(join(TEMPLATES, 'agents', 'tasks', 'template.md'), 'utf8')
      .replace('{id}', next)
      .replace('{title}', title.replace(/:/g, ' -'))
      .replace(/^owner: codex$/m, `owner: ${owner}`)
      .replace(/^milestone: M0$/m, `milestone: ${flags.milestone || 'M0'}`);
    const path = project.packetPath(next);
    if (existsSync(path)) throw new AodError(`${path} already exists`);
    writeFileSync(path, text);
    index.tasks.push(newTaskRecord(next, title, { owner, milestone: flags.milestone || 'M0' }));
    index.next_id += 1;
    saveIndex(project, index);
    return next;
  });
  return { id, packet: project.packetRel(id), next: 'Fill in scope, acceptance and context, then `aod task commit`' };
}

export function packetValidate({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { errors, data } = checkPacket(readPacketText(project, id), id);
  const index = loadIndex(project);
  for (const field of ['scope', 'acceptance']) {
    for (const v of data?.[field] || []) if (/<[^<>]+>/.test(v)) errors.push(`${field}: fill in the placeholder in "${v}"`);
  }
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

// Repo-relative paths of the spec and contracts a packet references (ADR ids resolved to their files).
export function referencedDocs(project, packet) {
  const out = [];
  if (packet.spec && packet.spec !== 'none') out.push(packet.spec.replace(/\\/g, '/'));
  const decisions = join(project.agents, 'decisions');
  for (const c of packet.contracts || []) {
    if (/^ADR-\d{4}$/.test(c)) {
      const f = existsSync(decisions) && readdirSync(decisions).find((n) => n.startsWith(`${c}-`) || n === `${c}.md`);
      out.push(f ? `.agents/decisions/${f}` : `.agents/decisions/${c}*.md`);
    } else out.push(c.replace(/\\/g, '/'));
  }
  return out;
}

// Each referenced doc must be committed (and unchanged) on `ref`, so task branches cut from it carry it.
function docProblems(root, ref, docs, { checkWorkingTree }) {
  const problems = [];
  for (const d of docs) {
    if (d.includes('*')) problems.push(`${d} (no such ADR)`);
    else if (!git(['cat-file', '-e', `${ref}:${d}`], root, { allowFail: true }).ok) problems.push(`${d} (not committed on ${ref})`);
    else if (checkWorkingTree && git(['status', '--porcelain', '--', d], root)) problems.push(`${d} (uncommitted changes)`);
  }
  return problems;
}

// Merge the base branch into task/T-xxxx without a checkout (brings in ADRs/specs committed after the branch).
export function taskSync({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { root, config } = project;
  const branch = taskBranch(id);
  const base = config.base_branch;
  if (!branchExists(root, branch)) throw new AodError(`${branch} does not exist; run aod task commit ${id}`);
  if (branchExists(root, `codex/${id}`) && !flags.force) {
    throw new AodError(`${id} is already delegated (codex/${id} exists); syncing now would not reach the implementer. Use --force to sync anyway.`);
  }
  if (git(['merge-base', '--is-ancestor', base, branch], root, { allowFail: true }).ok) return { id, branch, synced: false, note: `already contains ${base}` };
  const probe = git(['merge-tree', '--write-tree', branch, base], root, { allowFail: true });
  if (!probe.ok) throw new AodError(`${branch} conflicts with ${base}:\n${probe.out}`);
  const tree = probe.out.split('\n')[0];
  const commit = git(['commit-tree', tree, '-p', branch, '-p', base, '-m', `${id}: sync with ${base}`], root);
  git(['update-ref', `refs/heads/${branch}`, commit], root);
  return { id, branch, synced: true, commit: commit.slice(0, 7), next: `aod preflight ${id}` };
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
  // Specs and ADRs are project memory on the base branch; the task branch must carry the committed versions.
  const { data: packet } = checkPacket(readFileSync(project.packetPath(id), 'utf8'), id);
  const docs = referencedDocs(project, packet);
  const onBase = docProblems(root, config.base_branch, docs, { checkWorkingTree: true });
  if (onBase.length) {
    throw new AodError(`commit the referenced spec/ADRs on ${config.base_branch} first, then run this again:\n  ${onBase.join('\n  ')}`);
  }
  if (branchExists(root, branch)) {
    const onTask = docProblems(root, branch, docs, { checkWorkingTree: false });
    if (onTask.length) throw new AodError(`${branch} predates these files; run aod task sync ${id} first:\n  ${onTask.join('\n  ')}`);
  }
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
  // The committed packet is the source of truth: mirror the fields the ledger also shows (dependencies drive
  // aod delegate and aod wave; milestone, title and owner drive status, index.md and aod retro).
  updateTask(project, id, {
    depends_on: packet.depends_on || [],
    ...(packet.milestone ? { milestone: String(packet.milestone) } : {}),
    ...(packet.title ? { title: String(packet.title) } : {}),
    ...(packet.owner ? { owner: packet.owner } : {}),
  });
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
