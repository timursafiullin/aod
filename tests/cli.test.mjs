import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/aod.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('--version matches plugin.json', () => {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  const res = run('--version');
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), manifest.version);
});

test('unknown command exits 2 with usage', () => {
  const res = run('frobnicate');
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unknown command/);
});

test('doctor --json emits a parseable report', () => {
  const res = run('doctor', '--json');
  const report = JSON.parse(res.stdout);
  assert.ok(Array.isArray(report.results));
  assert.ok(['claude-only', 'claude+codex'].includes(report.mode));
});

test('marketplace lists the aod plugin from repo root', () => {
  const mp = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'));
  assert.equal(mp.plugins[0].name, 'aod');
  assert.equal(mp.plugins[0].source, './');
});
