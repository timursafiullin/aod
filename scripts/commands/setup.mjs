// aod init, aod slot *, aod index render, aod status
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  PLUGIN_ROOT, TEMPLATES, codexBranch, loadIndex, openProject, readJson, renderIndexMd, requireInitialized, saveIndex, writeJson,
} from '../lib/project.mjs';
import { AodError, branchExists, git, isClean } from '../lib/proc.mjs';

const toPosix = (p) => p.replace(/\\/g, '/');

function copyTree(src, dest, root, report) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d, root, report);
    else if (existsSync(d)) report.skipped.push(toPosix(relative(root, d)));
    else {
      cpSync(s, d);
      report.created.push(toPosix(relative(root, d)));
    }
  }
}

function hasCommits(root) {
  return git(['rev-parse', '--verify', '--quiet', 'HEAD'], root, { allowFail: true }).ok;
}

export function init({ cwd, slots }) {
  const project = openProject(cwd);
  const { root } = project;
  const report = { created: [], skipped: [], notes: [] };
  const rel = (p) => relative(root, p).replace(/\\/g, '/');

  copyTree(join(TEMPLATES, 'agents'), project.agents, root, report);

  if (!existsSync(project.configPath)) {
    const config = readJson(join(TEMPLATES, 'aod.config.json'));
    const branch = git(['symbolic-ref', '--short', 'HEAD'], root, { allowFail: true });
    if (branch.ok) config.base_branch = branch.out;
    if (slots) config.slots = Number(slots);
    writeJson(project.configPath, config);
    report.created.push(rel(project.configPath));
  } else report.skipped.push(rel(project.configPath));

  if (!existsSync(project.indexPath)) {
    saveIndex(project, loadIndex(project));
    report.created.push(rel(project.indexPath), '.agents/tasks/index.md');
  }

  const agentsMd = join(root, 'AGENTS.md');
  const block = readFileSync(join(TEMPLATES, 'AGENTS.md'), 'utf8').replace('{project}', basename(root));
  if (!existsSync(agentsMd)) {
    writeFileSync(agentsMd, block);
    report.created.push('AGENTS.md');
  } else if (!readFileSync(agentsMd, 'utf8').includes('<!-- aod:begin -->')) {
    appendFileSync(agentsMd, `\n${block.slice(block.indexOf('<!-- aod:begin -->'))}`);
    report.created.push('AGENTS.md (AOD section appended)');
  } else report.skipped.push('AGENTS.md');

  const claudeMd = join(root, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    cpSync(join(TEMPLATES, 'CLAUDE.md'), claudeMd);
    report.created.push('CLAUDE.md');
  } else {
    report.skipped.push('CLAUDE.md');
    if (!readFileSync(claudeMd, 'utf8').includes('@AGENTS.md')) {
      report.notes.push('CLAUDE.md exists without "@AGENTS.md"; add that line so the architect loads the AOD rules.');
    }
  }

  const gitignore = join(root, '.gitignore');
  for (const ignoreLine of ['.agents/tasks/jobs/', '.agents/.unlock']) {
    const current = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
    if (!current.split(/\r?\n/).includes(ignoreLine)) {
      appendFileSync(gitignore, `${current && !current.endsWith('\n') ? '\n' : ''}${ignoreLine}\n`);
      report.created.push(`.gitignore (${ignoreLine})`);
    }
  }

  // Slots are not created here: `aod delegate` creates them on demand from the then-current base branch,
  // so they never start from a commit that predates the scaffold.
  const base = openProject(cwd).config.base_branch;
  report.notes.push(hasCommits(root)
    ? `Commit the scaffold on ${base} (e.g. "chore: set up AOD"). Worktree slots are created on the first delegation.`
    : `The repository has no commits yet: make an initial commit on ${base}, then commit the scaffold.`);
  return report;
}

// ---- slots ----

export function createSlot(project, name) {
  const path = project.slotPath(name);
  if (existsSync(path)) {
    installSlotHook(project, path);
    return { created: false, path };
  }
  const branch = `slot/${name}`;
  const base = project.config.base_branch;
  const args = branchExists(project.root, branch)
    ? ['worktree', 'add', path, branch]
    : ['worktree', 'add', path, '-b', branch, base];
  git(args, project.root);
  installSlotHook(project, path);
  return { created: true, path };
}

// Pre-commit scope guard for slots only: a per-worktree core.hooksPath, so the main checkout's own hooks
// (husky etc.) are untouched. Re-installed on every delegation so it follows plugin updates.
export function installSlotHook(project, slotPath) {
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], project.root);
  const hooksDir = join(commonDir, 'aod-hooks');
  mkdirSync(hooksDir, { recursive: true });
  const node = process.execPath.replace(/\\/g, '/');
  const cli = join(PLUGIN_ROOT, 'scripts', 'aod.mjs').replace(/\\/g, '/');
  writeFileSync(join(hooksDir, 'pre-commit'), `#!/bin/sh\n# Installed by AOD: commits on codex/T-xxxx must stay inside the packet scope.\nexec "${node}" "${cli}" scope check\n`, { mode: 0o755 });
  git(['config', 'extensions.worktreeConfig', 'true'], project.root);
  git(['config', '--worktree', 'core.hooksPath', hooksDir], slotPath);
  return hooksDir;
}

export function runningJobs(project) {
  const dir = join(project.tasksDir, 'jobs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((id) => join(dir, id, 'state.json'))
    .filter(existsSync)
    .map(readJson)
    .filter((s) => s.status === 'running' && pidAlive(s.pid));
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function slotInfo(project, name) {
  const path = project.slotPath(name);
  if (!existsSync(path)) return { name, path, exists: false, free: false };
  const branch = git(['branch', '--show-current'], path);
  const clean = isClean(path);
  const job = runningJobs(project).find((j) => j.slot === name);
  return { name, path, exists: true, branch, clean, job: job?.task_id || null, free: clean && !job && branch === `slot/${name}` };
}

export function pickSlot(project, wanted) {
  const names = wanted ? [wanted] : project.slotNames();
  for (const name of names) {
    if (!existsSync(project.slotPath(name))) createSlot(project, name);
    const info = slotInfo(project, name);
    if (info.free) return info;
    if (wanted) throw new AodError(`slot ${name} is not free (branch ${info.branch}, clean=${info.clean}, job=${info.job})`);
  }
  throw new AodError('no free slot: wait for a running job, close a reviewed task, or raise `slots` in aod.config.json');
}

export function resetSlot(project, name, { force = false } = {}) {
  const path = project.slotPath(name);
  if (!existsSync(path)) throw new AodError(`slot ${name} does not exist`);
  if (runningJobs(project).some((j) => j.slot === name)) throw new AodError(`slot ${name} has a running job`);
  if (!isClean(path)) {
    if (!force) throw new AodError(`slot ${name} has uncommitted changes; inspect them or pass --force to discard`);
    git(['checkout', '--force', '--', '.'], path);
    git(['clean', '-fd'], path);
  }
  git(['switch', '--force', '-C', `slot/${name}`, project.config.base_branch], path);
  return slotInfo(project, name);
}

export function slot({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const [sub, name] = args;
  if (sub === 'list' || !sub) return project.slotNames().map((n) => slotInfo(project, n));
  if (sub === 'create') {
    const names = flags.all || !name ? project.slotNames() : [name];
    return names.map((n) => ({ name: n, ...createSlot(project, n) }));
  }
  if (sub === 'reset') {
    if (!name) throw new AodError('usage: aod slot reset <name> [--force]', 2);
    return resetSlot(project, name, { force: !!flags.force });
  }
  throw new AodError(`unknown slot command "${sub}" (list|create|reset)`, 2);
}

export function indexRender({ cwd }) {
  const project = requireInitialized(openProject(cwd));
  const index = loadIndex(project);
  writeFileSync(join(project.tasksDir, 'index.md'), renderIndexMd(index));
  return { written: '.agents/tasks/index.md', tasks: index.tasks.length };
}

export function status({ cwd, args, flags = {} }) {
  const project = requireInitialized(openProject(cwd));
  const index = loadIndex(project);
  const open = (t) => !['done', 'cancelled'].includes(t.status);
  const tasks = args[0] ? index.tasks.filter((t) => t.id === args[0]) : index.tasks.filter((t) => flags.all || open(t));
  const hidden = index.tasks.filter((t) => !open(t)).length;
  return {
    tasks: tasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, slot: t.slot, rounds: t.rounds,
      branch: branchExists(project.root, codexBranch(t.id)) ? codexBranch(t.id) : null,
    })),
    slots: project.slotNames().map((n) => slotInfo(project, n)),
    running: runningJobs(project).map((j) => ({ task: j.task_id, slot: j.slot, started: j.started })),
    ...(!flags.all && !args[0] && hidden ? { hidden_closed_tasks: hidden, hint: 'aod status --all' } : {}),
  };
}
