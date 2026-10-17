// aod preflight T-xxxx: deterministic pre-flight (methodology §9.2 phase 0, §21.4) before delegation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { lintSpec } from '../lib/ears.mjs';
import { matchesAny, normalizePath } from '../lib/glob.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import {
  assertTaskId, checkPacket, getTask, loadIndex, openProject, readPacketText, requireInitialized, taskBranch,
} from '../lib/project.mjs';
import { branchExists, git, sh } from '../lib/proc.mjs';
import { buildBrief } from './run.mjs';
import { slotInfo } from './setup.mjs';

const BRIEF_LIMIT = 6000;

const showOnBranch = (root, ref, path) => {
  const r = git(['show', `${ref}:${path}`], root, { allowFail: true });
  return r.ok ? r.out : null;
};

// Why did an acceptance command fail? Returns { level, detail }.
export function classifyFailure(output, scope, checkoutDir) {
  const text = output || '';
  const missing = /Cannot find module '([^']+)'/.exec(text) || /ERR_MODULE_NOT_FOUND[^\n]*?'([^']+)'/.exec(text);
  if (missing) {
    let p = missing[1];
    if (isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) p = relative(checkoutDir, p);
    p = normalizePath(p).replace(/^(\.\.\/)+/, '');
    return matchesAny(p, scope)
      ? { level: 'pass', detail: `fails because ${p} does not exist yet (inside scope: the task creates it)` }
      : { level: 'fail', detail: `fails because module ${p} is missing, but it is outside the task scope` };
  }
  if (/No module named ['"]?([\w.]+)/.test(text)) {
    return { level: 'warn', detail: `Python import error (${/No module named ['"]?([\w.]+)/.exec(text)[1]}): confirm the task creates that module` };
  }
  if (/\bSyntaxError\b/.test(text)) return { level: 'fail', detail: 'fails with a SyntaxError: fix the test before delegating' };
  if (/command not found|is not recognized as an internal or external command|ENOENT|No such file or directory/i.test(text)) {
    return { level: 'fail', detail: 'fails because a command or file is missing: the acceptance command itself is broken' };
  }
  return { level: 'pass', detail: 'fails (check the tail: it should be an assertion about the missing behaviour)' };
}

function withTaskCheckout(project, id, fn) {
  const free = project.slotNames().map((n) => slotInfo(project, n)).find((s) => s.free);
  if (free) {
    git(['switch', '--detach', taskBranch(id)], free.path);
    try {
      return fn(free.path, `slot ${free.name}`);
    } finally {
      git(['switch', '--force', `slot/${free.name}`], free.path);
    }
  }
  const dir = join(mkdtempSync(join(tmpdir(), 'aod-preflight-')), 'checkout');
  git(['worktree', 'add', '--detach', dir, taskBranch(id)], project.root);
  try {
    return fn(dir, 'temporary worktree');
  } finally {
    git(['worktree', 'remove', '--force', dir], project.root, { allowFail: true });
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
}

// Coarse glob overlap: equal, or one glob's literal prefix contains the other's.
export function globsOverlap(a, b) {
  const base = (g) => normalizePath(g).split(/[*?[]/)[0];
  return a.some((x) => b.some((y) => {
    const bx = base(x);
    const by = base(y);
    return bx.startsWith(by) || by.startsWith(bx);
  }));
}

export function preflight({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const id = assertTaskId(args[0]);
  const { root, config } = project;
  const checks = [];
  const add = (name, level, detail) => checks.push({ name, level, detail });
  const index = loadIndex(project);
  const task = getTask(index, id);

  const { errors, data: packet, body } = checkPacket(readPacketText(project, id), id);
  add('packet', errors.length ? 'fail' : 'pass', errors.length ? errors.join('; ') : 'front matter valid');
  if (errors.length) return finish(id, checks);

  const hasBranch = branchExists(root, taskBranch(id));
  add('task-branch', hasBranch ? 'pass' : 'fail', hasBranch ? taskBranch(id) : `missing; run aod task commit ${id}`);
  if (!hasBranch) return finish(id, checks);
  const ref = taskBranch(id);

  const notDone = (packet.depends_on || []).filter((d) => index.tasks.find((t) => t.id === d)?.status !== 'done');
  add('depends-on', notDone.length ? 'fail' : 'pass', notDone.length ? `not done: ${notDone.join(', ')}` : 'all done');

  for (const c of packet.contracts || []) {
    if (/^ADR-\d{4}$/.test(c)) {
      const file = git(['ls-tree', '--name-only', `${ref}:.agents/decisions`], root, { allowFail: true }).out
        .split('\n').find((f) => f.startsWith(`${c}-`) || f === `${c}.md`);
      const text = file ? showOnBranch(root, ref, `.agents/decisions/${file}`) : null;
      const accepted = text && /^Status:\s*Accepted/m.test(text);
      add(`contract ${c}`, accepted ? 'pass' : 'fail', !text ? 'ADR not found' : accepted ? 'Accepted' : 'ADR is not Accepted');
    } else {
      const exists = git(['cat-file', '-e', `${ref}:${c}`], root, { allowFail: true }).ok;
      add(`contract ${c}`, exists ? 'pass' : 'fail', exists ? 'exists' : `not found on ${ref}`);
    }
  }

  if (packet.spec && packet.spec !== 'none') {
    const spec = showOnBranch(root, ref, packet.spec);
    if (!spec) add('spec', 'fail', `${packet.spec} not found on ${ref}`);
    else {
      const lint = lintSpec(spec);
      let status = 'unknown';
      try {
        status = parseFrontmatter(spec).data.status;
      } catch {}
      add('spec', lint.errors.length ? 'fail' : 'pass', lint.errors.length ? lint.errors.join('; ') : `${lint.requirements.length} EARS requirement(s), status ${status}`);
      if (status === 'draft') add('spec-status', 'warn', 'spec is still draft; large specs need PO approval');
      for (const w of lint.warnings) add('spec-lint', 'warn', w);
      const ids = lint.requirements.map((r) => r.id);
      const mentioned = ids.filter((r) => new RegExp(`\\b${r}\\b`).test(body));
      add('spec-trace', mentioned.length ? 'pass' : 'warn', mentioned.length ? `packet implements ${mentioned.join(', ')}` : 'packet body names no requirement ids (e.g. "Implements: R1, R2")');
    }
  }

  const acceptanceFiles = git(['diff', '--name-only', `${config.base_branch}...${ref}`], root).split('\n')
    .filter(Boolean).filter((f) => matchesAny(f, config.protected || []));
  add('acceptance-tests', acceptanceFiles.length ? 'pass' : 'warn', acceptanceFiles.length ? acceptanceFiles.join(', ') : `no new files under ${(config.protected || []).join(', ')} on ${ref}`);

  const others = index.tasks.filter((t) => t.id !== id && ['ready', 'in_progress', 'review', 'blocked'].includes(t.status));
  const overlaps = others.filter((t) => {
    try {
      return globsOverlap(packet.scope, checkPacket(readPacketText(project, t.id), t.id).data?.scope || []);
    } catch {
      return false;
    }
  }).map((t) => t.id);
  add('scope-overlap', overlaps.length ? 'warn' : 'pass', overlaps.length ? `scope may overlap with ${overlaps.join(', ')}: do not run them in parallel` : 'no overlap with active tasks');

  const briefLen = buildBrief(project, packet).length;
  add('brief-size', briefLen > BRIEF_LIMIT ? 'warn' : 'pass', `${briefLen} characters (limit ~${BRIEF_LIMIT})`);

  if (!flags['no-run']) {
    withTaskCheckout(project, id, (dir, where) => {
      for (const cmd of packet.acceptance) {
        const r = sh(cmd, dir, 10 * 60_000);
        if (r.exit_code === 0) add(`red: ${cmd}`, 'fail', `passes before implementation (${where}): the test does not test the new behaviour`);
        else {
          const c = classifyFailure(r.tail, packet.scope, dir);
          add(`red: ${cmd}`, c.level, `${c.detail}\n${r.tail.slice(-600)}`);
        }
      }
    });
  }
  return finish(id, checks, task);
}

function finish(id, checks) {
  const failed = checks.filter((c) => c.level === 'fail');
  const warnings = checks.filter((c) => c.level === 'warn');
  return {
    exit: failed.length ? 1 : 0,
    result: {
      id, ok: !failed.length, failed: failed.length, warnings: warnings.length, checks,
      next: failed.length ? 'fix the packet/tests (aod packet restore, aod task commit), then run aod preflight again'
        : `review warnings and check spec/ADR/contract consistency by reading them, then aod task set ${id} status=ready`,
    },
  };
}
