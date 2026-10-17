// M6: release consistency (ADR-0008). Fails CI as soon as plugin.json and CHANGELOG drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { changelogSections, releaseCheck } from '../scripts/dev/release-notes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('plugin.json version matches the newest CHANGELOG entry', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const r = releaseCheck({ tag: `v${plugin.version}`, pluginVersion: plugin.version, changelog: read('CHANGELOG.md'), allowUnreleased: true });
  assert.deepEqual(r.errors, []);
  assert.ok(r.notes.length > 20);
});

test('release check rejects drift, bad tags and empty entries', () => {
  const changelog = '# Changelog\n\n## 1.0.0 — First stable\n\n- Stable.\n\n## 0.9.0\n\n- Older.\n';
  assert.deepEqual(changelogSections(changelog).map((s) => [s.version, s.title]), [['1.0.0', 'First stable'], ['0.9.0', '']]);
  const ok = releaseCheck({ tag: 'v1.0.0', pluginVersion: '1.0.0', changelog });
  assert.equal(ok.ok, true);
  assert.equal(ok.title, 'v1.0.0 — First stable');
  assert.equal(ok.notes, '- Stable.');
  assert.equal(ok.prerelease, false);
  assert.match(releaseCheck({ tag: 'v1.0.1', pluginVersion: '1.0.1', changelog }).errors.join(), /newest CHANGELOG entry is 1\.0\.0/);
  assert.match(releaseCheck({ tag: 'v1.0.0', pluginVersion: '0.9.0', changelog }).errors.join(), /plugin\.json has version 0\.9\.0/);
  assert.match(releaseCheck({ tag: 'release-1', pluginVersion: '1.0.0', changelog }).errors.join(), /not v<semver>/);
  assert.match(releaseCheck({ tag: 'v2.0.0', pluginVersion: '2.0.0', changelog: '## 2.0.0\n\n' }).errors.join(), /is empty/);
  const pending = `## Unreleased\n\n- Next.\n\n${changelog}`;
  assert.equal(releaseCheck({ tag: 'v1.0.0', pluginVersion: '1.0.0', changelog: pending, allowUnreleased: true }).ok, true);
  assert.equal(releaseCheck({ tag: 'v1.0.0', pluginVersion: '1.0.0', changelog: pending }).ok, false, 'a release needs a versioned entry');
  assert.equal(releaseCheck({ tag: 'v1.0.0-rc.1', pluginVersion: '1.0.0-rc.1', changelog: '## 1.0.0-rc.1\n- x\n' }).prerelease, true);
});

test('every skill has a name matching its folder and a description', () => {
  for (const dir of readdirSync(join(ROOT, 'skills'))) {
    const text = read(`skills/${dir}/SKILL.md`);
    assert.match(text, new RegExp(`^---\\nname: ${dir}\\n`), `skills/${dir}: name must be "${dir}"`);
    const desc = /^description: (.+)$/m.exec(text)?.[1] || '';
    assert.ok(desc.length >= 40 && desc.length <= 1024, `skills/${dir}: description length ${desc.length}`);
  }
});

test('README links only to files that exist', () => {
  const readme = read('README.md');
  for (const [, target] of readme.matchAll(/\]\(((?!https?:|#)[^)\s]+)\)/g)) {
    assert.ok(existsSync(join(ROOT, target.split('#')[0])), `README links to missing ${target}`);
  }
});

test('the demo runs the whole loop and shows a gate catching an out-of-scope edit', async () => {
  const { runDemo } = await import('../scripts/dev/demo.mjs');
  const lines = [];
  const r = runDemo({ log: (l) => lines.push(l) });
  assert.equal(r.ok, true);
  assert.equal(r.steps.length, 8);
  const out = lines.join('\n');
  assert.match(out, /FAIL scope: README\.md \(outside scope\)/);
  assert.match(out, /Implemented-by: codex/);
  assert.match(out, /first-pass acceptance 0%, avg rounds 1, scope violations 1/);
});
