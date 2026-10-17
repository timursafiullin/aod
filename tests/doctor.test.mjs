import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, runDoctor, formatDoctor } from '../scripts/lib/doctor.mjs';

const locate = () => ['codex'];
const fakeRun = (available) => (cmd, args) => {
  const key = `${cmd} ${args.join(' ')}`;
  return key in available ? available[key] : null;
};

const ALL = {
  'git --version': 'git version 2.47.0',
  'git worktree list': '/repo abc [master]',
  'codex --version': 'codex-cli 1.4.0',
  'claude --version': '2.1.302 (Claude Code)',
};

test('parseVersion extracts semver', () => {
  assert.deepEqual(parseVersion('v22.15.0'), { major: 22, minor: 15, patch: 0, raw: '22.15.0' });
  assert.equal(parseVersion('nope'), null);
});

test('all tools present -> ready, claude+codex mode', () => {
  const r = runDoctor({ run: fakeRun(ALL), nodeVersion: 'v22.1.0', locate });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'claude+codex');
});

test('missing codex is a warning and switches to claude-only', () => {
  const { ['codex --version']: _, ...rest } = ALL;
  const r = runDoctor({ run: fakeRun(rest), nodeVersion: 'v22.1.0', locate });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'claude-only');
  assert.match(formatDoctor(r), /\[warn\] codex/);
});

test('git older than 2.38 fails', () => {
  const r = runDoctor({ run: fakeRun({ ...ALL, 'git --version': 'git version 2.30.1' }), nodeVersion: 'v22.1.0', locate });
  assert.equal(r.ok, false);
});

test('old node or missing git fails', () => {
  assert.equal(runDoctor({ run: fakeRun(ALL), nodeVersion: 'v18.0.0', locate }).ok, false);
  const { ['git --version']: _, ...noGit } = ALL;
  assert.equal(runDoctor({ run: fakeRun(noGit), nodeVersion: 'v22.1.0', locate }).ok, false);
});
