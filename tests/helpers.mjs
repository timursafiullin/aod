// Shared fixtures: a throwaway git repo with the aod CLI wired to the fake Codex.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../scripts/aod.mjs', import.meta.url));
export const FAKE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));

export function setup(scenario, extraEnv = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'aod-e2e-'));
  const repo = join(tmp, 'toy');
  mkdirSync(repo);
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const env = { ...process.env, AOD_CODEX_CMD: JSON.stringify([process.execPath, FAKE]), FAKE_CODEX_SCENARIO: scenario, ...extraEnv };
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
  return { tmp, repo, git, aod, env, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

export function prepareTask({ repo, git, aod }) {
  let r = aod('init', '--slots', '1');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!existsSync(join(repo, '..', 'toy-worktrees')), 'slots are created lazily by delegate');
  assert.ok(existsSync(join(repo, '.agents', 'skills', 'aod-implementer', 'SKILL.md')), 'implementer skill for Codex');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: aod scaffold');

  r = aod('packet', 'new', 'Implement add');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.id, 'T-0001');
  const packetPath = join(repo, '.agents', 'tasks', 'T-0001.md');
  const packet = readFileSync(packetPath, 'utf8')
    .replace(/^ {2}- <command.*$/m, '  - node tests/acceptance/add.test.mjs');
  writeFileSync(packetPath, packet);
  mkdirSync(join(repo, 'tests', 'acceptance'), { recursive: true });
  writeFileSync(join(repo, 'tests', 'acceptance', 'add.test.mjs'),
    "import assert from 'node:assert/strict';\nimport { add } from '../../src/add.mjs';\nassert.equal(add(2, 3), 5);\n");

  r = aod('task', 'commit', 'T-0001', 'tests/acceptance/add.test.mjs');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git('branch', '--show-current'), 'main');
  assert.ok(!existsSync(packetPath), 'packet lives on task branch, not on main');

  // Amend: restore, edit and commit again onto the existing task branch.
  r = aod('packet', 'restore', 'T-0001');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(aod('packet', 'restore', 'T-0001').code, 1, 'refuses to overwrite a restored packet');
  writeFileSync(packetPath, readFileSync(packetPath, 'utf8').replace('budget_minutes: 30', 'budget_minutes: 45'));
  r = aod('task', 'commit', 'T-0001');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git('rev-list', '--count', 'main..task/T-0001'), '2');
  assert.match(git('show', 'task/T-0001:.agents/tasks/T-0001.md'), /budget_minutes: 45/);
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', '.agents/tasks/T-0001.md', 'tests'), '');

  r = aod('delegate', 'T-0001');
  assert.equal(r.code, 1, 'not ready yet -> refused');
  r = aod('task', 'set', 'T-0001', 'status=ready');
  assert.equal(r.code, 0, r.stderr);
}
