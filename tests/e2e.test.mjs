// End-to-end delegation loop on a throwaway repo with a fake Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { prepareTask, setup } from './helpers.mjs';


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

    // packet show reads the packet from task/T-0001 without git path syntax.
    r = ctx.aod('packet', 'show', 'T-0001');
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^---\nid: T-0001\n/);

    // A slot touched after gates (e.g. by a reviewer) blocks the merge.
    const slot = join(ctx.repo, '..', 'toy-worktrees', 'codex-1');
    writeFileSync(join(slot, 'stray.txt'), 'x');
    r = ctx.aod('merge', 'T-0001');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /slot codex-1 changed after gates/);
    rmSync(join(slot, 'stray.txt'));

    // Unrelated dirt on main blocks the merge; the journal passed with --journal does not.
    const journal = '.agents/journal/2026-10-17-test.md';
    writeFileSync(join(ctx.repo, journal), '# 2026-10-17 — test\n## Done\n- T-0001 merged\n');
    r = ctx.aod('merge', 'T-0001');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /2026-10-17-test\.md/);

    r = ctx.aod('merge', 'T-0001', '--reviewed-by', 'claude (fresh context)', '--journal', journal);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(ctx.git('log', '-1', '--format=%s'), 'T-0001: Implement add');
    assert.match(ctx.git('log', '-1', '--format=%b'), /Implemented-by: codex \(gpt-6\.1-sol\)\nReviewed-by: claude/);
    assert.match(ctx.git('show', '--stat', '--format=', 'HEAD'), /2026-10-17-test\.md/);
    assert.ok(existsSync(join(ctx.repo, 'src', 'add.mjs')));
    assert.ok(existsSync(join(ctx.repo, '.agents', 'tasks', 'T-0001.report.json')));
    assert.equal(ctx.git('status', '--porcelain'), '');

    r = ctx.aod('status');
    assert.deepEqual(r.json.tasks, []);
    assert.equal(r.json.hint, 'aod status --all');
    assert.equal(ctx.aod('status', '--all').json.tasks[0].status, 'done');

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

const argsLog = (ctx) => readFileSync(join(ctx.tmp, 'codex-args.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const modelOf = (argv) => argv[argv.indexOf('-m') + 1];
const effortOf = (argv) => argv[argv.indexOf('-c') + 1];

test('routing: implement model first, escalate after a failed job (ADR-0006)', () => {
  const ctx = setup('crash');
  try {
    ctx.env.FAKE_CODEX_ARGS_LOG = join(ctx.tmp, 'codex-args.jsonl');
    prepareTask(ctx);
    let r = ctx.aod('delegate', 'T-0001');
    assert.equal(r.code, 1);
    assert.equal(r.json.failures, 1);
    assert.equal(r.json.role, 'implement');
    assert.equal(ctx.aod('reject', 'T-0001').code, 0);
    ctx.env.FAKE_CODEX_HEALED = '1';
    r = ctx.aod('delegate', 'T-0001');
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.equal(r.json.role, 'escalate');
    const calls = argsLog(ctx).filter((a) => a[0] === 'exec');
    assert.equal(modelOf(calls[0]), 'gpt-6.1-sol');
    assert.equal(effortOf(calls[0]), 'model_reasoning_effort="medium"');
    assert.equal(effortOf(calls[1]), 'model_reasoning_effort="high"');

    // Presets switch the routing in one command.
    r = ctx.aod('route', 'preset', 'economy');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(ctx.aod('route', 'show').json.implement.model, 'gpt-5.6-terra');
    assert.equal(ctx.aod('route', 'preset', 'nonsense').code, 2);
  } finally {
    ctx.cleanup();
  }
});

test('quota exhaustion stops cleanly with exit 5 and no failure counted', () => {
  const ctx = setup('quota');
  try {
    prepareTask(ctx);
    const r = ctx.aod('delegate', 'T-0001');
    assert.equal(r.code, 5, r.stdout + r.stderr);
    assert.equal(r.json.unavailable, 'quota');
    assert.match(r.json.next, /Stop and ask the user/);
    const index = JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8'));
    assert.equal(index.tasks[0].status, 'ready');
    assert.equal(index.tasks[0].failures || 0, 0);
    assert.equal(ctx.git('branch', '--list', 'codex/T-0001'), '', 'implementer branch removed');
    assert.equal(ctx.aod('slot', 'list').json[0].free, true);

    // Codex missing entirely: refused before anything changes.
    ctx.env.AOD_CODEX_CMD = JSON.stringify([join(ctx.tmp, 'no-such-codex.exe')]);
    const missing = ctx.aod('delegate', 'T-0001');
    assert.equal(missing.code, 5);
    assert.match(missing.stderr, /Codex CLI not found.*Stop and ask/s);
    assert.equal(JSON.parse(readFileSync(join(ctx.repo, '.agents', 'tasks', 'index.json'), 'utf8')).tasks[0].status, 'ready');
  } finally {
    ctx.cleanup();
  }
});

test('aod review and aod explore drive Codex in the right modes', () => {
  const ctx = setup('good');
  try {
    prepareTask(ctx);
    ctx.env.FAKE_CODEX_ARGS_LOG = join(ctx.tmp, 'codex-args.jsonl');
    let r = ctx.aod('review', '--base', 'main');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.blockers, 0);
    r = ctx.aod('review', '--commit', 'HEAD', '--focus', 'error types');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.findings.length, 1);
    const calls = argsLog(ctx);
    assert.deepEqual(calls[0].slice(0, 4), ['exec', 'review', '--base', 'main']);
    assert.ok(!calls[1].includes('--commit'), 'focus uses custom-instructions mode, no target flag');
    assert.equal(modelOf(calls[1]), 'gpt-6.1-sol');

    r = ctx.aod('explore', 'Where is add defined?');
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /src\/add\.mjs:1/);
    assert.ok(argsLog(ctx)[2].includes('read-only'));
    assert.equal(modelOf(argsLog(ctx)[2]), 'gpt-6-luna');

    ctx.env.FAKE_CODEX_SCENARIO = 'quota';
    assert.equal(ctx.aod('review').code, 5);
  } finally {
    ctx.cleanup();
  }
});
