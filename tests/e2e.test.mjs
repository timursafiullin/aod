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
    assert.match(ctx.git('log', '-1', '--format=%b'), /Implemented-by: codex\nReviewed-by: claude/);
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
