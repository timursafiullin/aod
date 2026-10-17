// M3: EARS specs, ADRs, journal, sessions and the full preflight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { earsKind, lintSpec } from '../scripts/lib/ears.mjs';
import { classifyFailure, globsOverlap } from '../scripts/commands/preflight.mjs';
import { slugify } from '../scripts/commands/memory.mjs';
import { prepareTask, setup } from './helpers.mjs';

test('EARS kinds and lint', () => {
  assert.equal(earsKind('The parser shall reject empty input.'), 'ubiquitous');
  assert.equal(earsKind('When the user submits, the form shall validate all fields.'), 'event');
  assert.equal(earsKind('While offline, the app shall queue writes.'), 'state');
  assert.equal(earsKind('If the token expires, then the client shall refresh it.'), 'unwanted');
  assert.equal(earsKind('Where audit logging is enabled, the server shall record every login.'), 'optional');
  assert.equal(earsKind('Make it fast.'), null);
  assert.equal(earsKind('When expr contains binary +, -, * or /, the evaluator shall apply usual precedence.'), 'event');
  assert.equal(earsKind('If the divisor is 0, 1 or -1, then the evaluator shall check overflow.'), 'unwanted');

  const { requirements, errors, warnings } = lintSpec([
    '- R1: When input is empty, the parser shall throw SyntaxError.',
    '  Acceptance: tests/acceptance/calc.test.mjs :: malformed input',
    '- R2: The parser should be fast.',
    '- R1: The parser shall parse and the parser shall print.',
  ].join('\n'));
  assert.equal(requirements.length, 3);
  assert.equal(requirements[0].acceptance, 'tests/acceptance/calc.test.mjs :: malformed input');
  assert.ok(errors.some((e) => e.startsWith('R2') && e.includes('not EARS')));
  assert.ok(lintSpec('- R1: If x is empty, the parser shall throw.').errors[0].includes('", then the <system> shall'));
  assert.ok(lintSpec('- R1: When x is empty, throw.').errors[0].includes('no "shall"'));
  assert.ok(errors.some((e) => e === 'R1: duplicate id'));
  assert.ok(warnings.some((w) => w.includes('"should"')));
  assert.ok(warnings.some((w) => w.includes('more than one "shall"')));
  assert.ok(warnings.some((w) => w.startsWith('R2: no "Acceptance:"')));
});

test('slugs stop at a word boundary', () => {
  assert.equal(slugify('Evaluate integer arithmetic with a hand-written recursive-descent parser, no eval'),
    'evaluate-integer-arithmetic-with-a-hand-written');
  assert.equal(slugify('Short title'), 'short-title');
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

    // A fresh packet still has template placeholders: validation refuses it.
    r = aod('packet', 'new', 'Placeholder check');
    const placeholder = join(repo, r.json.packet);
    r = aod('packet', 'validate', r.json.id);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /acceptance: fill in the placeholder/);
    rmSync(placeholder);

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
    assert.equal(r.json.verdict, 'ready (baseline not configured)');
    assert.ok(r.json.notes.some((n) => n.includes('session.baseline')));
    assert.ok(r.json.read_next.includes('.agents/context/invariants.md'));

    writeFileSync(join(repo, 'stray.js'), '');
    r = aod('session', 'end');
    assert.equal(r.json.step, 'tree');
    git('add', 'stray.js');
    git('commit', '-q', '-m', 'chore: stray');
    r = aod('session', 'end');
    assert.equal(r.code, 0);
    assert.equal(r.json.status, 'pending-commit');
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
    const original = readFileSync(p, 'utf8');

    // A packet that references an uncommitted spec/ADR is refused; committing it on main then needs a sync.
    writeFileSync(p, original.replace('contracts: []', 'contracts: [ADR-0009]'));
    r = aod('task', 'commit', 'T-0001');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /ADR-0009\*\.md \(no such ADR\)/);
    const adr = aod('adr', 'new', 'Add is integer addition');
    writeFileSync(p, original.replace('contracts: []', `contracts: [${adr.json.id}]`));
    r = aod('task', 'commit', 'T-0001');
    assert.match(r.stderr, /not committed on main/);
    ctx.git('add', adr.json.file, '.agents/decisions/index.md');
    ctx.git('commit', '-q', '-m', 'docs: ADR');
    r = aod('task', 'commit', 'T-0001');
    assert.match(r.stderr, /run aod task sync T-0001/);
    r = aod('task', 'sync', 'T-0001');
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json.synced, true);
    assert.equal(aod('task', 'sync', 'T-0001').json.synced, false, 'idempotent');
    writeFileSync(p, original.replace('contracts: []', `contracts: [${adr.json.id}]`)
      .replace('  - node tests/acceptance/add.test.mjs', '  - node -e "process.exit(0)"'));
    r = aod('task', 'commit', 'T-0001');
    assert.equal(r.code, 0, r.stderr);

    r = aod('preflight', 'T-0001');
    assert.equal(r.code, 1);
    const byName = Object.fromEntries(r.json.checks.map((c) => [c.name, c]));
    assert.equal(byName[`contract ${adr.json.id}`].level, 'fail', 'ADR is only Proposed');
    assert.match(byName[`contract ${adr.json.id}`].detail, /not Accepted/);
    assert.equal(byName['red: node -e "process.exit(0)"'].level, 'fail');
    assert.match(byName['red: node -e "process.exit(0)"'].detail, /passes before implementation/);
  } finally {
    ctx.cleanup();
  }
});
