// End-to-end delegation loop on a throwaway repo with a fake Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/aod.mjs', import.meta.url));
const FAKE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));

function setup(scenario) {
  const tmp = mkdtempSync(join(tmpdir(), 'aod-e2e-'));
  const repo = join(tmp, 'toy');
  mkdirSync(repo);
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const env = { ...process.env, AOD_CODEX_CMD: JSON.stringify([process.execPath, FAKE]), FAKE_CODEX_SCENARIO: scenario };
  const aod = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8', env });
    let json = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {}
    return { code: r.status, json, stderr: r.stderr, stdout: r.stdout };
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'README.md'), '# toy\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  return { tmp, repo, git, aod, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

function prepareTask({ repo, git, aod }) {
  let r = aod('init', '--slots', '1');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(repo, '..', 'toy-worktrees', 'codex-1')), 'slot created');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: aod scaffold');

  r = aod('packet', 'new', 'Implement add');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.id, 'T-0001');
  const packetPath = join(repo, '.agents', 'tasks', 'T-0001.md');
  const packet = readFileSync(packetPath, 'utf8')
    .replace('  - src/**', '  - src/**')
    .replace('  - npm test', '  - node tests/acceptance/add.test.mjs');
  writeFileSync(packetPath, packet);
  mkdirSync(join(repo, 'tests', 'acceptance'), { recursive: true });
  writeFileSync(join(repo, 'tests', 'acceptance', 'add.test.mjs'),
    "import assert from 'node:assert/strict';\nimport { add } from '../../src/add.mjs';\nassert.equal(add(2, 3), 5);\n");

  r = aod('task', 'commit', 'T-0001', 'tests/acceptance/add.test.mjs');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git('branch', '--show-current'), 'main');
  assert.ok(!existsSync(packetPath), 'packet lives on task branch, not on main');

  // Amend: restore, edit and commit again onto the existing task branch.
  const restored = git('show', 'task/T-0001:.agents/tasks/T-0001.md');
  writeFileSync(packetPath, `${restored.replace('budget_minutes: 60', 'budget_minutes: 30')}\n`);
  r = aod('task', 'commit', 'T-0001');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git('rev-list', '--count', 'main..task/T-0001'), '2');
  assert.match(git('show', 'task/T-0001:.agents/tasks/T-0001.md'), /budget_minutes: 30/);
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', '.agents/tasks/T-0001.md', 'tests'), '');

  r = aod('delegate', 'T-0001');
  assert.equal(r.code, 1, 'not ready yet -> refused');
  r = aod('task', 'set', 'T-0001', 'status=ready');
  assert.equal(r.code, 0, r.stderr);
}

test('happy path: delegate -> gates -> merge', () => {
  const ctx = setup('good');
  try {
    prepareTask(ctx);
    let r = ctx.aod('delegate', 'T-0001');
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.equal(r.json.status, 'review');
    assert.equal(r.json.thread_id, '00000000-0000-4000-8000-000000000001');

    r = ctx.aod('gates', 'T-0001');
    assert.equal(r.code, 0, r.stdout);
    assert.ok(r.json.results.every((x) => x.ok));

    r = ctx.aod('merge', 'T-0001', '--reviewed-by', 'claude (fresh context)');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(ctx.git('log', '-1', '--format=%s'), 'T-0001: Implement add');
    assert.match(ctx.git('log', '-1', '--format=%b'), /Implemented-by: codex\nReviewed-by: claude/);
    assert.ok(existsSync(join(ctx.repo, 'src', 'add.mjs')));
    assert.ok(existsSync(join(ctx.repo, '.agents', 'tasks', 'T-0001.report.json')));
    assert.equal(ctx.git('status', '--porcelain'), '');

    const index = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.equal(index.tasks[0].status, 'done');
    assert.deepEqual(index.tasks[0].verdicts, ['ACCEPT']);
    assert.equal(index.tasks[0].usage.input_tokens, 1000);

    r = ctx.aod('slot', 'list');
    assert.equal(r.json[0].branch, 'slot/codex-1');
    assert.equal(r.json[0].free, true);
  } finally {
    ctx.cleanup();
  }
});

test('out-of-scope change fails gates, revise repairs it', () => {
  const ctx = setup('out-of-scope');
  try {
    prepareTask(ctx);
    assert.equal(ctx.aod('delegate', 'T-0001').code, 0);
    let r = ctx.aod('gates', 'T-0001');
    assert.equal(r.code, 1);
    const scope = r.json.results.find((x) => x.name === 'scope');
    assert.match(scope.detail, /README\.md \(outside scope\)/);
    assert.equal(ctx.aod('merge', 'T-0001').code, 1, 'merge refuses failed gates');

    const findings = join(ctx.tmp, 'findings.md');
    writeFileSync(findings, 'F1 [blocker] README.md - outside scope. Required: revert. Verify: aod gates.\n');
    r = ctx.aod('revise', 'T-0001', '--findings', findings);
    assert.equal(r.code, 0, r.stderr);
    r = ctx.aod('gates', 'T-0001');
    assert.equal(r.code, 0, r.stdout);
    assert.equal(ctx.aod('merge', 'T-0001').code, 0);
    const index = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.deepEqual(index.tasks[0].verdicts, ['REVISE', 'ACCEPT']);
    assert.equal(index.tasks[0].rounds, 1);
  } finally {
    ctx.cleanup();
  }
});

test('added skip marker fails the no-skips gate', () => {
  const ctx = setup('skip');
  try {
    prepareTask(ctx);
    assert.equal(ctx.aod('delegate', 'T-0001').code, 0);
    const r = ctx.aod('gates', 'T-0001');
    assert.equal(r.code, 1);
    assert.equal(r.json.results.find((x) => x.name === 'no-skips').ok, false);
  } finally {
    ctx.cleanup();
  }
});

test('blocked implementer exits 3 and can be answered', () => {
  const ctx = setup('blocked');
  try {
    prepareTask(ctx);
    let r = ctx.aod('delegate', 'T-0001');
    assert.equal(r.code, 3);
    assert.deepEqual(r.json.open_questions, ['Should add() accept strings?']);
    const answer = join(ctx.tmp, 'answer.md');
    writeFileSync(answer, 'Numbers only.\n');
    r = ctx.aod('revise', 'T-0001', '--findings', answer, '--answer');
    assert.equal(r.code, 0, r.stderr);
    r = ctx.aod('gates', 'T-0001');
    assert.equal(r.code, 0, r.stdout);
  } finally {
    ctx.cleanup();
  }
});
