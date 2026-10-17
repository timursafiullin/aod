import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { matchesAny } from '../scripts/lib/glob.mjs';
import { validate } from '../scripts/lib/schema.mjs';
import { scopeViolations, skipMarkers } from '../scripts/commands/run.mjs';
import { renderIndexMd, schema } from '../scripts/lib/project.mjs';

test('front matter: scalars, inline and block lists, comments, quotes', () => {
  const { data, body } = parseFrontmatter(`---
id: T-0007
title: "Add parser: v2"
budget_minutes: 45   # minutes
depends_on: []
deliverables: [code, "docs: guide.md"]
scope:
  - src/parser/**   # only parser
  - 'tests/unit/#1/**'
---
## Context
`);
  assert.equal(data.id, 'T-0007');
  assert.equal(data.title, 'Add parser: v2');
  assert.equal(data.budget_minutes, 45);
  assert.deepEqual(data.depends_on, []);
  assert.deepEqual(data.deliverables, ['code', 'docs: guide.md']);
  assert.deepEqual(data.scope, ['src/parser/**', 'tests/unit/#1/**']);
  assert.match(body, /## Context/);
});

test('front matter: missing block throws', () => {
  assert.throws(() => parseFrontmatter('no front matter'), /missing front matter/);
});

test('glob: ** crosses directories, * does not', () => {
  assert.ok(matchesAny('src/a/b/c.ts', ['src/**']));
  assert.ok(matchesAny('src/c.ts', ['src/**/*.ts']));
  assert.ok(!matchesAny('src/a/c.ts', ['src/*.ts']));
  assert.ok(matchesAny('src\\win\\path.ts', ['src/**']));
  assert.ok(!matchesAny('srcx/a.ts', ['src/**']));
  assert.ok(matchesAny('README.md', ['*.md']));
});

test('packet schema rejects missing scope and bad id', () => {
  const errors = validate(schema('packet'), { id: 'T-1', title: 'Do it', owner: 'codex', acceptance: ['x'], budget_minutes: 30 });
  assert.ok(errors.some((e) => e.includes('"scope"')));
  assert.ok(errors.some((e) => e.includes('$.id')));
});

test('report schema is Codex-strict: every property required, no extras', () => {
  const s = schema('report');
  const check = (node, path) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${path} additionalProperties`);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path} required`);
      for (const [k, v] of Object.entries(node.properties)) check(v, `${path}.${k}`);
    }
    if (node.items) check(node.items, `${path}[]`);
  };
  check(s, '$');
  assert.deepEqual(validate(s, { task_id: 'T-0001', status: 'done', summary: 's', commits: [], files_changed: [], checks: [], deviations: [], open_questions: [], risks: [], extra: 1 }),
    ['$: unexpected property "extra"']);
});

test('scope violations distinguish forbidden from out-of-scope', () => {
  const v = scopeViolations(['src/a.js', 'tests/acceptance/x.js', 'README.md'], ['src/**', 'tests/**'], ['tests/acceptance/**']);
  assert.deepEqual(v, ['tests/acceptance/x.js (forbidden)', 'README.md (outside scope)']);
});

test('skip markers are detected only on added lines', () => {
  const diff = `+++ b/src/a.test.js
+it.skip('x', () => {})
-test.only('y')
+++ b/tests/t.py
+@pytest.mark.xfail
+def test_ok(): pass`;
  assert.deepEqual(skipMarkers(diff), ["src/a.test.js: it.skip('x', () => {})", 'tests/t.py: @pytest.mark.xfail']);
});

test('index.md render escapes pipes and shows next id', () => {
  const md = renderIndexMd({ version: 1, next_id: 3, tasks: [{ id: 'T-0001', title: 'a | b', owner: 'codex', status: 'done', rounds: 0, verdicts: ['ACCEPT'] }] });
  assert.match(md, /a \\\| b/);
  assert.match(md, /Next id: T-0003/);
});

test('relativeInside compares paths as strings, case-insensitively for drive paths', async () => {
  const { relativeInside } = await import('../scripts/lib/paths.mjs');
  const opts = { real: false };
  assert.equal(relativeInside(String.raw`C:\w\slot`, 'c:/W/slot/src/a.mjs', opts), 'src/a.mjs');
  assert.equal(relativeInside(String.raw`C:\w\slot`, String.raw`C:\w\slot-2\a.mjs`, opts), null);
  assert.equal(relativeInside('/repo', '/repo', opts), '');
  assert.equal(relativeInside('/repo', '/repo/x/y', opts), 'x/y');
  assert.equal(relativeInside('/repo', '/other', opts), null);
});
