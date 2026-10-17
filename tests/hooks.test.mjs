// M2 guardrails: hook handlers, slot pre-commit scope guard and integrity heuristics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitInvocations } from '../scripts/lib/shellwords.mjs';
import { destructive, slotWrite } from '../scripts/hooks/git-guard.mjs';
import { integrityChecks } from '../scripts/lib/integrity.mjs';
import { prepareTask, setup } from './helpers.mjs';

const hook = (name) => fileURLToPath(new URL(`../scripts/hooks/${name}.mjs`, import.meta.url));
const runHook = (name, input) => {
  const r = spawnSync(process.execPath, [hook(name)], { input: JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

test('shellwords finds git invocations through quotes, operators, -C and cd', () => {
  assert.deepEqual(gitInvocations('git status && git -C "../a b" push --force origin main'), [
    { dir: null, sub: 'status', args: [] },
    { dir: '../a b', sub: 'push', args: ['--force', 'origin', 'main'] },
  ]);
  assert.deepEqual(gitInvocations('cd ../x; GIT_PAGER=cat git log -1 | head'), [
    { cd: '../x' }, { dir: null, sub: 'log', args: ['-1'] },
  ]);
  assert.deepEqual(gitInvocations('echo "git push --force"'), []);
  assert.equal(gitInvocations(String.raw`git -C "C:\Users\a b\slot" status`)[0].dir, String.raw`C:\Users\a b\slot`);
  assert.deepEqual(gitInvocations('git -c core.x=1 reset --hard HEAD~1'), [{ dir: null, sub: 'reset', args: ['--hard', 'HEAD~1'] }]);
});

test('destructive git rules', () => {
  const d = (cmd) => destructive(gitInvocations(cmd)[0]);
  for (const bad of ['git push -f', 'git push origin +main', 'git push --force-with-lease', 'git reset --hard',
    'git rebase -i main', 'git clean -fdx', 'git branch -D x', 'git checkout -- .', 'git restore src/a.js', 'git stash clear']) {
    assert.ok(d(bad), bad);
  }
  for (const ok of ['git push origin main', 'git reset HEAD~1', 'git clean -n', 'git branch', 'git checkout -b feat',
    'git restore --staged a.js', 'git status', 'git commit -m x']) {
    assert.equal(d(ok), null, ok);
  }
});

test('slot rules allow only read-only git', () => {
  const w = (cmd) => slotWrite(gitInvocations(cmd)[0]);
  for (const ok of ['git log --oneline', 'git diff --stat a...b', 'git show x:y', 'git status', 'git branch --show-current', 'git worktree list']) {
    assert.equal(w(ok), null, ok);
  }
  for (const bad of ['git checkout --detach x', 'git switch main', 'git commit -m x', 'git add -A', 'git stash', 'git branch newb']) {
    assert.ok(w(bad), bad);
  }
});

test('integrity heuristics', () => {
  const diffText = [
    '+++ b/src/calc.mjs', "+  if (expr === '2 + 3 * 4') return 14;", "+  if (process.env.NODE_ENV === 'test') return 0;",
    '+++ b/tests/unit/x.test.mjs', '-  assert.ok(Math.abs(a - b) < 1e-9); // tol', '+  assert.ok(Math.abs(a - b) < 1e-2); // tol',
  ].join('\n');
  const nameStatus = 'M\ttests/unit/x.test.mjs\nD\ttests/unit/old.test.mjs\nA\tsrc/calc.mjs';
  const res = Object.fromEntries(integrityChecks({
    diffText, nameStatus, testGlobs: ['**/*.test.*', '**/tests/**'],
    acceptanceSources: ["assert.equal(evaluate('2 + 3 * 4'), 14);"],
  }).map((r) => [r.name, r]));
  assert.equal(res['no-deleted-tests'].level, 'fail');
  assert.equal(res['no-test-detection'].level, 'fail');
  assert.equal(res['existing-tests-untouched'].level, 'warn');
  assert.equal(res['tolerances-unchanged'].level, 'warn');
  assert.equal(res['no-special-casing'].level, 'warn');
  assert.equal(res['no-skips'].level, 'pass');
});

test('hooks are silent outside AOD repositories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aod-noproj-'));
  try {
    assert.equal(runHook('git-guard', { cwd: dir, tool_input: { command: 'git push --force' } }).code, 0);
    assert.equal(runHook('contract-guard', { cwd: dir, tool_input: { file_path: join(dir, 'schemas/x.json') } }).code, 0);
    const s = runHook('session-start', { cwd: dir, source: 'startup' });
    assert.equal(s.code, 0);
    assert.equal(s.stdout, '');
    assert.equal(runHook('stop-gate', { cwd: dir }).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guards, briefing, stop gate and slot pre-commit in an AOD repo', () => {
  const ctx = setup('good');
  try {
    prepareTask(ctx);
    const { repo, aod, git } = ctx;
    assert.equal(aod('delegate', 'T-0001').code, 0);
    const slot = join(repo, '..', 'toy-worktrees', 'codex-1');

    // git guard
    let r = runHook('git-guard', { cwd: repo, tool_input: { command: 'git push --force origin main' } });
    assert.equal(r.code, 2, r.stderr);
    assert.match(r.stderr, /force-push/);
    assert.equal(runHook('git-guard', { cwd: repo, tool_input: { command: 'git status && git log -1' } }).code, 0);
    r = runHook('git-guard', { cwd: repo, tool_input: { command: `git -C "${slot}" checkout --detach codex/T-0001` } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /worktree slot/);
    assert.equal(runHook('git-guard', { cwd: repo, tool_input: { command: `git -C "${slot}" diff --stat task/T-0001...codex/T-0001` } }).code, 0);

    // contract guard + unlock
    const acc = join(repo, 'tests', 'acceptance', 'new.test.mjs');
    r = runHook('contract-guard', { cwd: repo, tool_input: { file_path: acc } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /aod unlock/);
    assert.equal(runHook('contract-guard', { cwd: repo, tool_input: { file_path: join(repo, 'src', 'x.mjs') } }).code, 0);
    assert.equal(runHook('contract-guard', { cwd: repo, tool_input: { file_path: join(slot, 'src', 'add.mjs') } }).code, 2);
    assert.equal(aod('unlock').code, 2, 'reason is required');
    assert.equal(aod('unlock', '--reason', 'acceptance tests for T-0002').code, 0);
    assert.equal(runHook('contract-guard', { cwd: repo, tool_input: { file_path: acc } }).code, 0);
    assert.equal(aod('lock').code, 0);
    assert.equal(runHook('contract-guard', { cwd: repo, tool_input: { file_path: acc } }).code, 2);

    const adr = join(repo, '.agents', 'decisions', 'ADR-0001-x.md');
    writeFileSync(adr, '# ADR-0001: x\n\nStatus: Accepted\n');
    assert.equal(runHook('contract-guard', { cwd: repo, tool_input: { file_path: adr } }).code, 2);
    rmSync(adr);

    // session briefing
    writeFileSync(join(repo, '.agents', 'journal', '2026-10-17-a.md'), '# x\n## Done\n- a\n## Next step\n- Review T-0001.\n');
    r = runHook('session-start', { cwd: repo, source: 'startup' });
    const ctxText = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctxText, /Next step: - Review T-0001\./);
    assert.match(ctxText, /T-0001 review in codex-1/);
    assert.doesNotMatch(ctxText, /Invariants/);
    r = runHook('session-start', { cwd: repo, source: 'compact' });
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Invariants \(re-injected/);

    // stop gate: off by default, blocks with red checks and changes, never loops
    writeFileSync(join(repo, 'scratch.txt'), 'x');
    assert.equal(runHook('stop-gate', { cwd: repo }).code, 0, 'disabled by default');
    const cfgPath = join(repo, '.agents', 'aod.config.json');
    const cfg = JSON.parse(git('show', 'HEAD:.agents/aod.config.json'));
    cfg.stop_gate = { enabled: true, commands: ['node -e "process.exit(3)"'], timeout_minutes: 1 };
    writeFileSync(cfgPath, JSON.stringify(cfg));
    r = runHook('stop-gate', { cwd: repo });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /exited 3/);
    assert.equal(runHook('stop-gate', { cwd: repo, stop_hook_active: true }).code, 0);
    cfg.stop_gate.commands = ['node -e "process.exit(0)"'];
    writeFileSync(cfgPath, JSON.stringify(cfg));
    assert.equal(runHook('stop-gate', { cwd: repo }).code, 0);
    rmSync(join(repo, 'scratch.txt'));
    git('checkout', '--', '.agents/aod.config.json');

    // slot pre-commit scope guard (for implementers that can commit)
    const sgit = (...args) => spawnSync('git', args, { cwd: slot, encoding: 'utf8' });
    writeFileSync(join(slot, 'README.md'), 'out of scope\n');
    sgit('add', 'README.md');
    r = sgit('commit', '-m', 'T-0001: sneaky');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /README\.md \(outside scope\)/);
    sgit('reset', '-q', 'HEAD', 'README.md');
    sgit('checkout', '--', 'README.md');
    mkdirSync(join(slot, 'src'), { recursive: true });
    writeFileSync(join(slot, 'src', 'more.mjs'), 'export const x = 1;\n');
    sgit('add', 'src/more.mjs');
    r = sgit('commit', '-m', 'T-0001: in scope');
    assert.equal(r.status, 0, r.stderr);
    const mainHooks = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repo, encoding: 'utf8' });
    assert.equal(mainHooks.status, 1, `main checkout hooks untouched, got ${mainHooks.stdout}`);
  } finally {
    ctx.cleanup();
  }
});
