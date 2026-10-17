// M3: EARS specs, ADRs, journal, sessions and the full preflight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { earsKind, lintSpec } from '../scripts/lib/ears.mjs';
import { classifyFailure, globsOverlap } from '../scripts/commands/preflight.mjs';
import { prepareTask, setup } from './helpers.mjs';

test('EARS kinds and lint', () => {
  assert.equal(earsKind('The parser shall reject empty input.'), 'ubiquitous');
  assert.equal(earsKind('When the user submits, the form shall validate all fields.'), 'event');
  assert.equal(earsKind('While offline, the app shall queue writes.'), 'state');
  assert.equal(earsKind('If the token expires, then the client shall refresh it.'), 'unwanted');
  assert.equal(earsKind('Where audit logging is enabled, the server shall record every login.'), 'optional');
  assert.equal(earsKind('Make it fast.'), null);

  const { requirements, errors, warnings } = lintSpec([
    '- R1: When input is empty, the parser shall throw SyntaxError.',
    '  Acceptance: tests/acceptance/calc.test.mjs :: malformed input',
    '- R2: The parser should be fast.',
    '- R1: The parser shall parse and the parser shall print.',
  ].join('\n'));
  assert.equal(requirements.length, 3);
  assert.equal(requirements[0].acceptance, 'tests/acceptance/calc.test.mjs :: malformed input');
  assert.ok(errors.some((e) => e.startsWith('R2') && e.includes('not EARS')));
  assert.ok(errors.some((e) => e === 'R1: duplicate id'));
  assert.ok(warnings.some((w) => w.includes('"should"')));
  assert.ok(warnings.some((w) => w.includes('more than one "shall"')));
  assert.ok(warnings.some((w) => w.startsWith('R2: no "Acceptance:"')));
});

test('preflight failure classification and scope overlap', () => {
  const dir = 'C:\\w\\slot';
  assert.equal(classifyFailure("Error: Cannot find module 'C:\\w\\slot\\src\\calc.mjs' imported from x", ['src/**'], dir).level, 'pass');
  assert.equal(classifyFailure("Error: Cannot find module 'C:\\w\\slot\\lib\\util.mjs'", ['src/**'], dir).level, 'fail');
  assert.equal(classifyFailure('SyntaxError: Unexpected token', ['src/**'], dir).level, 'fail');
  assert.equal(classifyFailure('bash: pytest: command not found', ['src/**'], dir).level, 'fail');
  assert.equal(classifyFailure('AssertionError: expected 5, got undefined', ['src/**'], dir).level, 'pass');
  assert.ok(globsOverlap(['src/**'], ['src/calc/**']));
  assert.ok(!globsOverlap(['src/a/**'], ['src/b/**']));
});

test('ADR lifecycle, spec check, journal and session commands', () => {
  const ctx = setup('good');
  try {
    const { repo, aod, git } = ctx;
    assert.equal(aod('init').code, 0);
    git('add', '-A');
    git('commit', '-q', '-m', 'chore: aod scaffold');

    // ADR: new -> accept refused while empty -> filled -> accept -> supersede
    let r = aod('adr', 'new', 'Use integers only');
    assert.equal(r.json.id, 'ADR-0001');
    assert.equal(aod('adr', 'accept', 'ADR-0001').code, 1);
    const adrPath = join(repo, r.json.file);
    writeFileSync(adrPath, readFileSync(adrPath, 'utf8')
      .replace('## Context\n', '## Context\n\nToy calculator.\n')
      .replace('## Decision\n', '## Decision\n\nIntegers only.\n')
      .replace('## Consequences\n', '## Consequences\n\nNo floats.\n'));
    assert.equal(aod('adr', 'accept', 'ADR-0001').code, 0);
    assert.match(readFileSync(adrPath, 'utf8'), /^Status: Accepted$/m);
    const idx = () => readFileSync(join(repo, '.agents', 'decisions', 'index.md'), 'utf8');
    assert.match(idx(), /\| \[ADR-0001\]\([^)]+\) \| Use integers only \| Accepted \|/);
    assert.equal(aod('adr', 'new', 'Allow decimals').json.id, 'ADR-0002');
    assert.equal(aod('adr', 'supersede', 'ADR-0001', '--by', 'ADR-0002').code, 0);
    assert.match(readFileSync(adrPath, 'utf8'), /^Status: Superseded by ADR-0002$/m);
    assert.match(idx(), /ADR-0001\]\([^)]+\) \| Use integers only \| Superseded by ADR-0002 \|/);

    // Spec
    r = aod('spec', 'new', 'Integer arithmetic');
    assert.equal(r.json.id, 'S-0001');
    const specPath = join(repo, r.json.file);
    writeFileSync(specPath, readFileSync(specPath, 'utf8').replace(/- R1:[\s\S]*?(?=\n## Out of scope)/,
      '- R1: When the input is empty, the evaluator shall throw SyntaxError.\n  Acceptance: tests/acceptance/calc.test.mjs :: empty\n- R2: The evaluator should be quick.\n'));
    r = aod('spec', 'check', 'S-0001');
    assert.equal(r.code, 1);
    assert.ok(r.json.errors.some((e) => e.startsWith('R2')));

    // Journal + session end
    r = aod('journal', 'new', '--topic', 'm3 test');
    assert.equal(r.json.created, true);
    assert.equal(aod('journal', 'new').json.created, false, "today's entry is reused");
    assert.equal(aod('journal', 'check').code, 1, 'empty Done/Next step');
    const jPath = join(repo, r.json.file);
    writeFileSync(jPath, readFileSync(jPath, 'utf8').replace('## Done\n', '## Done\n- ADR-0001, S-0001\n')
      .replace('## Next step\n', '## Next step\n- Cut packets for S-0001.\n'));
    assert.equal(aod('journal', 'check').code, 0);

    r = aod('session', 'start');
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.journal.next, '- Cut packets for S-0001.');
    assert.equal(r.json.verdict, 'ready');

    writeFileSync(join(repo, 'stray.js'), '');
    r = aod('session', 'end');
    assert.equal(r.json.step, 'tree');
    git('add', 'stray.js');
    git('commit', '-q', '-m', 'chore: stray');
    r = aod('session', 'end');
    assert.equal(r.code, 1);
    assert.ok(r.json.pending.length > 0);
    r = aod('session', 'end', '--commit');
    assert.equal(r.code, 0, r.stdout);
    assert.equal(git('status', '--porcelain'), '');
    assert.match(git('log', '-1', '--format=%s'), /^docs: session journal /);

    // Red baseline
    const cfgPath = join(repo, '.agents', 'aod.config.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    cfg.session = { baseline: ['node -e "process.exit(4)"'] };
    writeFileSync(cfgPath, JSON.stringify(cfg));
    r = aod('session', 'start');
    assert.equal(r.code, 1);
    assert.match(r.json.verdict, /baseline is RED/);
  } finally {
    ctx.cleanup();
  }
});

test('preflight passes a good packet and fails an acceptance test that is already green', () => {
  const ctx = setup('good');
  try {
    prepareTask(ctx);
    const { repo, aod } = ctx;
    let r = aod('preflight', 'T-0001');
    assert.equal(r.code, 0, r.stdout);
    const red = r.json.checks.find((c) => c.name.startsWith('red:'));
    assert.equal(red.level, 'pass');
    assert.match(red.detail, /src\/add\.mjs does not exist yet/);
    assert.equal(r.json.checks.find((c) => c.name === 'acceptance-tests').level, 'pass');

    // Make the acceptance command trivially green: preflight must fail.
    assert.equal(aod('packet', 'restore', 'T-0001').code, 0);
    const p = join(repo, '.agents', 'tasks', 'T-0001.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('  - node tests/acceptance/add.test.mjs', '  - node -e "process.exit(0)"')
      .replace('contracts: []', 'contracts: [ADR-0009]'));
    assert.equal(aod('task', 'commit', 'T-0001').code, 0);
    r = aod('preflight', 'T-0001');
    assert.equal(r.code, 1);
    const byName = Object.fromEntries(r.json.checks.map((c) => [c.name, c]));
    assert.equal(byName['contract ADR-0009'].level, 'fail');
    assert.equal(byName['red: node -e "process.exit(0)"'].level, 'fail');
    assert.match(byName['red: node -e "process.exit(0)"'].detail, /passes before implementation/);
  } finally {
    ctx.cleanup();
  }
});
