// M5: ledger lock, parallel waves, retro metrics and the mutation-testing adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLI, setup } from './helpers.mjs';
import { parseMutationScore, mutationTargets } from '../scripts/lib/mutation.mjs';
import { computeMetrics, signals } from '../scripts/commands/retro.mjs';

// One packet per task: scope src/t-xxxx.mjs, its own acceptance test, optional dependencies.
function addTask(ctx, title, { deps = [] } = {}) {
  let r = ctx.aod('packet', 'new', title, '--milestone', 'M5');
  assert.equal(r.code, 0, r.stderr);
  const { id } = r.json;
  const name = id.toLowerCase();
  const packetPath = join(ctx.repo, '.agents', 'tasks', `${id}.md`);
  writeFileSync(packetPath, readFileSync(packetPath, 'utf8')
    .replace(/^depends_on: \[\]$/m, `depends_on: [${deps.join(', ')}]`)
    .replace(/^ {2}- src\/\*\*$/m, `  - src/${name}.mjs`)
    .replace(/^ {2}- <command.*$/m, `  - node tests/acceptance/${name}.test.mjs`));
  mkdirSync(join(ctx.repo, 'tests', 'acceptance'), { recursive: true });
  writeFileSync(join(ctx.repo, 'tests', 'acceptance', `${name}.test.mjs`),
    `import assert from 'node:assert/strict';\nimport { add } from '../../src/${name}.mjs';\nassert.equal(add(2, 3), 5);\n`);
  r = ctx.aod('task', 'commit', id, `tests/acceptance/${name}.test.mjs`);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(ctx.aod('task', 'set', id, 'status=ready').code, 0);
  return id;
}

const closeTask = (ctx, id) => {
  let r = ctx.aod('gates', id);
  assert.equal(r.code, 0, r.stdout);
  r = ctx.aod('merge', id, '--attention', '4');
  assert.equal(r.code, 0, r.stderr);
};

test('wave: 4 tasks (one dependent) run on 2 slots in two parallel waves, then retro reports them', () => {
  const ctx = setup('good', { FAKE_CODEX_PER_TASK: '1', FAKE_CODEX_DELAY_MS: '1500' });
  try {
    assert.equal(ctx.aod('init', '--slots', '2').code, 0);
    ctx.git('add', '-A');
    ctx.git('commit', '-q', '-m', 'chore: aod scaffold');
    const t1 = addTask(ctx, 'First');
    const t2 = addTask(ctx, 'Second');
    const t3 = addTask(ctx, 'Third');
    const t4 = addTask(ctx, 'Fourth', { deps: [t1] });
    const index = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.deepEqual(index.tasks.find((t) => t.id === t4).depends_on, [t1], 'task commit mirrors depends_on');

    let r = ctx.aod('wave', 'plan');
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json.wave.map((w) => [w.id, w.slot]), [[t1, 'codex-1'], [t2, 'codex-2']]);
    assert.deepEqual(r.json.deferred, [
      { id: t3, reason: 'no free slot in this wave' },
      { id: t4, reason: `depends on ${t1}` },
    ]);
    assert.equal(ctx.aod('delegate', t4).code, 1, 'delegate also refuses an unmet packet dependency');

    r = ctx.aod('wave', 'run');
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.equal(r.json.wave_number, 1);
    assert.deepEqual(r.json.ran.map((x) => x.status), ['review', 'review']);
    // The two jobs overlapped in time.
    const job = (id) => JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'jobs', id, 'state.json'), 'utf8'));
    const [a, b] = [job(t1), job(t2)];
    assert.ok(a.started < b.ended && b.started < a.ended, `jobs did not overlap: ${JSON.stringify([a, b])}`);

    r = ctx.aod('wave', 'plan');
    assert.deepEqual(r.json.wave, [], 'both slots hold tasks in review');
    closeTask(ctx, t1);
    closeTask(ctx, t2);

    r = ctx.aod('wave', 'run');
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.equal(r.json.wave_number, 2);
    assert.deepEqual(r.json.ran.map((x) => x.id), [t3, t4]);
    closeTask(ctx, t3);
    closeTask(ctx, t4);
    assert.equal(ctx.git('status', '--porcelain'), '');
    for (const id of [t1, t2, t3, t4]) assert.ok(existsSync(join(ctx.repo, 'src', `${id.toLowerCase()}.mjs`)));

    const ledger = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.deepEqual(ledger.tasks.map((t) => t.wave), [1, 1, 2, 2]);
    assert.deepEqual(ledger.tasks[0].events.map((e) => e.type), ['delegated', 'accepted']);

    r = ctx.aod('retro', '--milestone', 'M5', '--write');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.metrics.done, 4);
    assert.equal(r.json.metrics.first_pass_acceptance_pct, 100);
    assert.equal(r.json.metrics.attention_minutes.total, 16);
    assert.equal(r.json.metrics.waves.count, 2);
    assert.equal(r.json.metrics.tokens.total, 4 * 1050);
    assert.equal(r.json.metrics.tokens.uncached, 4 * 1050, 'the fake reports no cache hits');
    const md = readFileSync(join(ctx.repo, r.json.written), 'utf8');
    assert.match(md, /\| First-pass acceptance \| 100% \|/);
    assert.match(md, /## Signals/);
  } finally {
    ctx.cleanup();
  }
});

test('wave plan defers a task whose scope overlaps an earlier one', () => {
  const ctx = setup('good');
  try {
    assert.equal(ctx.aod('init', '--slots', '2').code, 0);
    ctx.git('add', '-A');
    ctx.git('commit', '-q', '-m', 'chore: aod scaffold');
    const t1 = addTask(ctx, 'One');
    const t2 = addTask(ctx, 'Two');
    // Widen T-0002's scope to src/** on its task branch: it now overlaps T-0001.
    assert.equal(ctx.aod('packet', 'restore', t2).code, 0);
    const p = join(ctx.repo, '.agents', 'tasks', `${t2}.md`);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^ {2}- src\/t-0002\.mjs$/m, '  - src/**').replace(/^milestone: M5$/m, 'milestone: M6'));
    assert.equal(ctx.aod('task', 'commit', t2).code, 0);
    const ledger = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.equal(ledger.tasks.find((t) => t.id === t2).milestone, 'M6', 'task commit mirrors the packet milestone');
    const slots = ctx.aod('status').json.slots;
    assert.deepEqual(slots.map((s) => [s.exists, s.free]), [[false, true], [false, true]], 'slots not created yet are free');
    const r = ctx.aod('wave', 'plan');
    assert.deepEqual(r.json.wave.map((w) => w.id), [t1]);
    assert.deepEqual(r.json.deferred, [{ id: t2, reason: `scope overlaps ${t1}` }]);
    assert.equal(ctx.aod('wave', 'plan', '--max', '0').code, 2);
  } finally {
    ctx.cleanup();
  }
});

test('wave run stops with exit 5 when Codex is out of quota', () => {
  const ctx = setup('quota', { FAKE_CODEX_PER_TASK: '1' });
  try {
    assert.equal(ctx.aod('init', '--slots', '2').code, 0);
    ctx.git('add', '-A');
    ctx.git('commit', '-q', '-m', 'chore: aod scaffold');
    addTask(ctx, 'One');
    addTask(ctx, 'Two');
    const r = ctx.aod('wave', 'run');
    assert.equal(r.code, 5, r.stdout);
    assert.deepEqual(r.json.ran.map((x) => x.status), ['ready', 'ready']);
    const ledger = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.ok(ledger.tasks.every((t) => t.status === 'ready' && t.events.at(-1).type === 'unavailable'));
  } finally {
    ctx.cleanup();
  }
});

test('ledger lock: concurrent packet new calls never lose an id', async () => {
  const ctx = setup('good');
  try {
    assert.equal(ctx.aod('init').code, 0);
    const run = () => new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, 'packet', 'new', 'Parallel'], { cwd: ctx.repo, env: ctx.env });
      let out = '';
      child.stdout.on('data', (c) => { out += c; });
      child.on('close', (code) => resolve({ code, out }));
    });
    const results = await Promise.all(Array.from({ length: 6 }, run));
    assert.ok(results.every((r) => r.code === 0), JSON.stringify(results));
    const ids = results.map((r) => JSON.parse(r.out).id).sort();
    assert.deepEqual(ids, ['T-0001', 'T-0002', 'T-0003', 'T-0004', 'T-0005', 'T-0006']);
    const ledger = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.equal(ledger.tasks.length, 6);
    assert.equal(ledger.next_id, 7);
    assert.ok(!existsSync(join(ctx.repo, '.agents', 'tasks', 'index.json.lock')));
  } finally {
    ctx.cleanup();
  }
});

test('retro metrics and signals from a hand-made ledger', () => {
  const t = (over) => ({ id: 'T-0001', title: 'x', owner: 'codex', status: 'done', rounds: 0, verdicts: ['ACCEPT'], started: '2026-10-17T10:00:00Z', finished: '2026-10-17T10:30:00Z', ...over });
  const tasks = [
    t({}),
    t({ id: 'T-0002', rounds: 2, verdicts: ['REVISE', 'REVISE', 'ACCEPT'], model: 'gpt-6-luna', events: [{ at: 'x', type: 'scope-violation' }] }),
    t({ id: 'T-0003', rounds: 2, events: [{ at: 'x', type: 'blocked' }], finished: '2026-10-17T11:30:00Z' }),
    t({ id: 'T-0004', owner: 'claude', started: null }),
    t({ id: 'T-0005', status: 'escalated', events: [{ at: 'x', type: 'escalated' }], finished: null, usage: { input_tokens: 9000, output_tokens: 1000 } }),
  ];
  const m = computeMetrics(tasks, { pool: 20000 });
  assert.equal(m.done, 4);
  assert.equal(m.first_pass_acceptance_pct, 33.3);
  assert.equal(m.avg_rounds, 1.33);
  assert.equal(m.blocked_rate_pct, 25);
  assert.equal(m.escalation_rate_pct, 25);
  assert.deepEqual(m.elapsed_minutes, { median: 30, avg: 50 });
  assert.equal(m.scope_violations, 1);
  assert.equal(m.architect_share_pct, 25);
  assert.equal(m.pool_pct, 50);
  assert.deepEqual(m.by_model['gpt-6-luna'], { tasks: 1, first_pass_pct: 0, avg_rounds: 2 });
  const s = signals(m).join('\n');
  assert.match(s, /First-pass acceptance 33\.3%/);
  assert.match(s, /1 scope violation/);
  assert.match(s, /Blocked rate 25%/);
  assert.match(s, /No attention minutes recorded/);
});

test('retro splits cached input from uncached tokens and bases the pool share on uncached', () => {
  // Usage as reported by codex-cli 0.163 for the live wave on aod-toy3: cached_input_tokens is part of input_tokens.
  const task = (id, usage) => ({ id, title: 'x', owner: 'codex', status: 'done', rounds: 0, usage });
  const tasks = [
    task('T-0001', { input_tokens: 92985, cached_input_tokens: 67328, output_tokens: 1667, reasoning_output_tokens: 166 }),
    task('T-0002', { input_tokens: 93340, cached_input_tokens: 44160, output_tokens: 1742, reasoning_output_tokens: 24 }),
    task('T-0003', { input_tokens: 100, cached_input_tokens: 500, output_tokens: 10 }), // inconsistent: clamp cached to input
    { id: 'T-0004', title: 'y', owner: 'codex', status: 'ready', rounds: 0 },
  ];
  const m = computeMetrics(tasks, { pool: 79394 });
  assert.equal(m.tokens.total, 189734 + 110);
  assert.equal(m.tokens.cached_input, 67328 + 44160 + 100);
  assert.equal(m.tokens.uncached, 78246 + 10);
  assert.equal(m.tokens.uncached_per_done_task, Math.round(78256 / 3));
  assert.equal(m.tokens.cache_hit_pct, 58.8);
  assert.equal(m.pool_pct, 98.6);
  assert.match(signals(m).join('\n'), /Uncached token use is 98\.6% of the configured pool/);
});

test('mutation score parsing for common tools and a custom regex', () => {
  assert.equal(parseMutationScore('INFO MutationTestReportHelper Final mutation score of 83.33 is greater than or equal to break threshold 60'), 83.33);
  assert.equal(parseMutationScore('Mutation Score Indicator (MSI): 71%'), 71);
  assert.equal(parseMutationScore('>> Generated 20 mutations Killed 15 (75%)'), 75);
  assert.equal(parseMutationScore('30 mutants tested in 1m: 9 missed, 21 caught'), 70);
  assert.equal(parseMutationScore('killed: 8, survived: 2'), 80);
  assert.equal(parseMutationScore('[info] Mutation score: 66%'), 66);
  assert.equal(parseMutationScore('nothing useful'), null);
  assert.equal(parseMutationScore('kills=4 total=5 rate 80.0', 'rate ([\\d.]+)'), 80);
  assert.deepEqual(mutationTargets(['src/a.mjs', 'src/a.test.mjs', 'docs/x.md'], { testGlobs: ['**/*.test.*'], include: ['src/**'] }), ['src/a.mjs']);
});

test('gates run the mutation adapter on changed source files and apply the threshold', () => {
  const ctx = setup('good');
  try {
    assert.equal(ctx.aod('init', '--slots', '1').code, 0);
    // A stand-in mutation tool: prints a fixed score and the files it was given.
    const tool = join(ctx.tmp, 'mutate.mjs');
    writeFileSync(tool, "console.log('files: ' + process.argv.slice(2).join(','));\nconsole.log('Mutation score: ' + process.env.SCORE + '%');\n");
    const cfgPath = join(ctx.repo, '.agents', 'aod.config.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    cfg.mutation = { command: `node "${tool.replace(/\\/g, '/')}" {files}`, threshold: 60, level: 'fail' };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    ctx.git('add', '-A');
    ctx.git('commit', '-q', '-m', 'chore: aod scaffold');
    const id = addTask(ctx, 'Mutated', {});
    // The default fake writes src/add.mjs; widen this packet's scope to it.
    assert.equal(ctx.aod('packet', 'restore', id).code, 0);
    const p = join(ctx.repo, '.agents', 'tasks', `${id}.md`);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^ {2}- src\/t-0001\.mjs$/m, '  - src/**').replace('t-0001.test.mjs', 'add.test.mjs'));
    writeFileSync(join(ctx.repo, 'tests', 'acceptance', 'add.test.mjs'), "import assert from 'node:assert/strict';\nimport { add } from '../../src/add.mjs';\nassert.equal(add(2, 3), 5);\n");
    assert.equal(ctx.aod('task', 'commit', id, 'tests/acceptance/add.test.mjs').code, 0);
    assert.equal(ctx.aod('delegate', id).code, 0);

    ctx.env.SCORE = '40';
    let r = ctx.aod('gates', id);
    const low = r.json.results.find((x) => x.name === 'mutation');
    assert.equal(r.code, 1, r.stdout);
    assert.equal(low.score, 40);
    assert.match(low.detail, /threshold 60%/);

    ctx.env.SCORE = '90';
    r = ctx.aod('gates', id);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.results.find((x) => x.name === 'mutation').level, 'pass');
    assert.ok(!r.json.results.some((x) => x.name === 'mutation' && /test/.test(x.detail)), 'test files are not mutated');

    r = ctx.aod('gates', id, '--no-mutation');
    assert.ok(!r.json.results.some((x) => x.name === 'mutation'));
    const ledger = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.ok(ledger.tasks[0].events.some((e) => e.type === 'gates-fail' && /mutation/.test(e.detail)));
  } finally {
    ctx.cleanup();
  }
});
