// Project memory: aod adr | spec | journal | session
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSpec } from '../lib/ears.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { TEMPLATES, loadIndex, openProject, requireInitialized } from '../lib/project.mjs';
import { AodError, git, isClean, sh } from '../lib/proc.mjs';
import { runningJobs, slotInfo } from './setup.mjs';
import { latestJournal } from '../hooks/session-start.mjs';
import { activeUnlock } from '../hooks/contract-guard.mjs';

export const today = () => new Date().toISOString().slice(0, 10);
export function slugify(s, max = 50) {
  const full = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (full.length <= max) return full || 'untitled';
  const cut = full.slice(0, max + 1);
  const at = cut.lastIndexOf('-');
  return (at > 10 ? cut.slice(0, at) : full.slice(0, max)).replace(/-$/, '');
}
const rel = (p) => p.replace(/\\/g, '/');

function nextNumber(dir, re) {
  if (!existsSync(dir)) return 1;
  const nums = readdirSync(dir).map((f) => re.exec(f)).filter(Boolean).map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function findById(dir, id) {
  const f = existsSync(dir) ? readdirSync(dir).find((n) => n === `${id}.md` || n.startsWith(`${id}-`)) : null;
  if (!f) throw new AodError(`${id} not found in ${rel(dir)}`);
  return join(dir, f);
}

// ---- ADRs ----

const decisionsDir = (p) => join(p.agents, 'decisions');

function setIndexStatus(project, id, status) {
  const idx = join(decisionsDir(project), 'index.md');
  if (!existsSync(idx)) return false;
  let changed = false;
  const lines = readFileSync(idx, 'utf8').split('\n').map((line) => {
    const cells = line.split(/(?<!\\)\|/);
    // ['', ' [ADR-0001](file) ', ' Title ', ' Status ', ' Date ', '']
    if (cells.length < 6 || !new RegExp(`^\\s*\\[?${id}\\b`).test(cells[1])) return line;
    cells[3] = ` ${status} `;
    changed = true;
    return cells.join('|');
  });
  if (changed) writeFileSync(idx, lines.join('\n'));
  return changed;
}

export function adrNew({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const title = args.join(' ').trim();
  if (!title) throw new AodError('usage: aod adr new "<decision, stated as a sentence>"', 2);
  const dir = decisionsDir(project);
  mkdirSync(dir, { recursive: true });
  const id = `ADR-${String(nextNumber(dir, /^ADR-(\d{4})/)).padStart(4, '0')}`;
  const file = `${id}-${slugify(title)}.md`;
  const tpl = readFileSync(join(TEMPLATES, 'agents', 'decisions', 'template.md'), 'utf8')
    .replace(/^# ADR-xxxx: .*$/m, `# ${id}: ${title}`)
    .replace(/^Status: .*$/m, 'Status: Proposed')
    .replace(/^Date: .*$/m, `Date: ${today()}`);
  writeFileSync(join(dir, file), tpl);
  appendFileSync(join(dir, 'index.md'), `| [${id}](${file}) | ${title.replace(/\|/g, '\\|')} | Proposed | ${today()} |\n`);
  return { id, file: `.agents/decisions/${file}`, status: 'Proposed', next: `fill Context, Decision, Consequences, Alternatives; then aod adr accept ${id} once decided` };
}

export function adrAccept({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = args[0];
  if (!/^ADR-\d{4}$/.test(id || '')) throw new AodError('usage: aod adr accept ADR-xxxx', 2);
  const path = findById(decisionsDir(project), id);
  const text = readFileSync(path, 'utf8');
  if (/^Status:\s*Accepted/m.test(text)) return { id, status: 'Accepted', changed: false };
  const empty = ['Context', 'Decision', 'Consequences'].filter((h) => {
    const m = new RegExp(`^## ${h}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
    return !m || !m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
  });
  if (empty.length) throw new AodError(`${id} cannot be accepted with empty sections: ${empty.join(', ')}`);
  writeFileSync(path, text.replace(/^Status: .*$/m, 'Status: Accepted'));
  setIndexStatus(project, id, 'Accepted');
  return { id, status: 'Accepted', changed: true, note: 'accepted ADRs are protected by the contract guard; change them only by superseding' };
}

export function adrSupersede({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const [oldId] = args;
  const newId = flags.by;
  if (!/^ADR-\d{4}$/.test(oldId || '') || !/^ADR-\d{4}$/.test(newId || '')) throw new AodError('usage: aod adr supersede ADR-old --by ADR-new', 2);
  const dir = decisionsDir(project);
  const newPath = findById(dir, newId);
  const oldPath = findById(dir, oldId);
  writeFileSync(oldPath, readFileSync(oldPath, 'utf8').replace(/^Status: .*$/m, `Status: Superseded by ${newId}`));
  setIndexStatus(project, oldId, `Superseded by ${newId}`);
  const newText = readFileSync(newPath, 'utf8');
  if (!newText.includes(`Supersedes ${oldId}`)) writeFileSync(newPath, newText.replace(/^(Date: .*)$/m, `$1\nSupersedes ${oldId}`));
  return { superseded: oldId, by: newId };
}

// ---- specs ----

const specsDir = (p) => join(p.agents, 'specs');

export function specNew({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const title = args.join(' ').trim();
  if (!title) throw new AodError('usage: aod spec new "<feature title>"', 2);
  const dir = specsDir(project);
  mkdirSync(dir, { recursive: true });
  const id = `S-${String(nextNumber(dir, /^S-(\d{4})/)).padStart(4, '0')}`;
  const file = `${id}-${slugify(title)}.md`;
  const text = readFileSync(join(TEMPLATES, 'agents', 'specs', 'template.md'), 'utf8')
    .replaceAll('{id}', id).replaceAll('{title}', title.replace(/:/g, ' -'));
  writeFileSync(join(dir, file), text);
  return { id, file: `.agents/specs/${file}`, next: `write EARS requirements, then aod spec check ${id}` };
}

export function specCheck({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const id = args[0];
  if (!/^S-\d{4}$/.test(id || '')) throw new AodError('usage: aod spec check S-xxxx', 2);
  const path = findById(specsDir(project), id);
  const text = readFileSync(path, 'utf8');
  const { data } = parseFrontmatter(text);
  const { requirements, errors, warnings } = lintSpec(text);
  if (data.id !== id) errors.push(`front matter id is "${data.id}", expected "${id}"`);
  const result = {
    id, file: rel(`.agents/specs/${path.split(/[\\/]/).pop()}`), status: data.status, ok: errors.length === 0,
    requirements: requirements.map((r) => ({ id: r.id, kind: r.kind, acceptance: r.acceptance })), errors, warnings,
  };
  return { exit: errors.length ? 1 : 0, result };
}

// ---- journal ----

const journalDir = (p) => join(p.agents, 'journal');
const REQUIRED = ['Done', 'Not done', 'Decisions', 'Open questions', 'Next step'];

export function journalNew({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  const dir = journalDir(project);
  mkdirSync(dir, { recursive: true });
  const date = today();
  const topic = typeof flags.topic === 'string' ? flags.topic : 'session';
  const existing = readdirSync(dir).filter((f) => f.startsWith(date) && f.endsWith('.md')).sort();
  if (existing.length && !flags.new) return { file: `.agents/journal/${existing[existing.length - 1]}`, created: false };
  const file = `${date}-${slugify(topic)}.md`;
  if (existsSync(join(dir, file))) return { file: `.agents/journal/${file}`, created: false };
  const tpl = existsSync(join(dir, 'template.md')) ? join(dir, 'template.md') : join(TEMPLATES, 'agents', 'journal', 'template.md');
  writeFileSync(join(dir, file), readFileSync(tpl, 'utf8').replace('{date}', date).replace('{topic}', topic)
    .replace('{task}', typeof flags.task === 'string' ? flags.task : 'none'));
  return { file: `.agents/journal/${file}`, created: true };
}

export function journalSections(text) {
  const out = {};
  for (const name of REQUIRED) {
    const m = new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
    out[name] = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : null;
  }
  return out;
}

export function journalCheck({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const dir = journalDir(project);
  const file = args[0] ? join(project.root, args[0]) : (() => {
    const j = latestJournal(project);
    if (!j) throw new AodError('no journal entries yet; run aod journal new');
    return join(dir, j.file);
  })();
  const sections = journalSections(readFileSync(file, 'utf8'));
  const missing = REQUIRED.filter((n) => sections[n] === null);
  const errors = missing.map((n) => `missing section "## ${n}"`);
  if (sections['Next step'] !== null && !sections['Next step']) errors.push('"Next step" is empty: the next session starts from it');
  if (sections.Done !== null && !sections.Done) errors.push('"Done" is empty');
  return { exit: errors.length ? 1 : 0, result: { file: rel(file.slice(project.root.length + 1)), ok: !errors.length, errors } };
}

// ---- session ----

export function sessionStart({ cwd }) {
  const project = requireInitialized(openProject(cwd));
  const { root, config } = project;
  const index = loadIndex(project);
  const branch = git(['branch', '--show-current'], root);
  const baseline = (config.session?.baseline || []).map((cmd) => {
    const r = sh(cmd, root, 10 * 60_000);
    return { cmd, exit_code: r.exit_code, ...(r.exit_code ? { tail: r.tail.slice(-800) } : {}) };
  });
  const unlock = activeUnlock(project);
  const roadmap = join(project.agents, 'plans', 'roadmap.md');
  const result = {
    journal: latestJournal(project),
    main: { branch, on_base: branch === config.base_branch, clean: isClean(root) },
    open_tasks: index.tasks.filter((t) => !['done', 'cancelled'].includes(t.status))
      .map((t) => ({ id: t.id, title: t.title, status: t.status, slot: t.slot, rounds: t.rounds })),
    running: runningJobs(project).map((j) => ({ task: j.task_id, slot: j.slot, started: j.started })),
    slots: project.slotNames().map((n) => slotInfo(project, n)).filter((s) => s.exists)
      .map((s) => ({ name: s.name, branch: s.branch, clean: s.clean, free: s.free })),
    baseline,
    unlocked: unlock ? { until: unlock.until, reason: unlock.reason } : null,
    read_next: [],
    notes: [],
  };
  const context = (f) => join(project.agents, 'context', f);
  const first = !result.journal;
  result.read_next = [...(first ? [context('vision.md')] : []), context('invariants.md'), roadmap,
    ...index.tasks.filter((t) => ['in_progress', 'review', 'blocked'].includes(t.status)).map((t) => project.packetPath(t.id))]
    .filter(existsSync).map((p) => rel(p.slice(root.length + 1)));
  if (first) result.notes.push('First AOD session here: read the vision and invariants, then plan with /aod:spec and /aod:adr before cutting packets.');
  if (!baseline.length) result.notes.push('No baseline checks configured: set session.baseline in .agents/aod.config.json (e.g. the project test command) so each session starts from a verified green state.');
  const red = baseline.some((b) => b.exit_code !== 0);
  result.verdict = red ? 'baseline is RED: fix or report before new work'
    : !result.main.on_base ? `main checkout is not on ${config.base_branch}`
      : baseline.length ? 'ready' : 'ready (baseline not configured)';
  return { exit: red ? 1 : 0, result };
}

export function sessionEnd({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  const { root } = project;
  const check = journalCheck({ cwd, args: [] });
  if (check.exit) return { exit: 1, result: { ok: false, step: 'journal', ...check.result } };
  if (runningJobs(project).length) return { exit: 1, result: { ok: false, step: 'jobs', error: 'Codex jobs are still running; wait or note them in the journal' } };
  if (activeUnlock(project) && !flags['keep-unlock']) return { exit: 1, result: { ok: false, step: 'unlock', error: 'contracts are still unlocked; run aod lock' } };
  const lines = git(['status', '--porcelain', '--untracked-files=all'], root).split('\n').filter(Boolean)
    .map((l) => l.replace(/^[ MADRCUT?!]{1,2} /, '').replace(/^"|"$/g, ''));
  const memory = lines.filter((p) => /^\.agents\/(journal|tasks\/index\.(json|md)|decisions|specs|plans|context|rules)\//.test(p)
    || /^\.agents\/tasks\/index\.(json|md)$/.test(p));
  const other = lines.filter((p) => !memory.includes(p));
  if (other.length) return { exit: 1, result: { ok: false, step: 'tree', error: 'uncommitted changes outside .agents memory; commit or stash them first', files: other } };
  let commit = null;
  if (memory.length && flags.commit) {
    git(['add', '--', ...memory], root);
    git(['commit', '-q', '-m', `docs: session journal ${today()}`], root);
    commit = git(['rev-parse', '--short', 'HEAD'], root);
  }
  // Pending memory files are not an error: the ledger rule commits them here (or with the next aod merge).
  const pending = commit ? [] : memory;
  return {
    exit: 0,
    result: {
      ok: true, status: pending.length ? 'pending-commit' : 'closed', journal: check.result.file, committed: commit, pending,
      next: pending.length ? 'review the memory changes, then aod session end --commit' : 'session closed: tree clean',
    },
  };
}
