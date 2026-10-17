#!/usr/bin/env node
// A narrated run of the whole AOD loop in a throwaway repository, using the fake Codex from the tests, so anyone
// can watch it in seconds without a Codex account: `node scripts/dev/demo.mjs [--slow] [--keep]`.
// The implementer deliberately edits a file outside its scope, so the demo also shows a gate catching it and
// a REVISE round on the same Codex thread. For the real thing with real Codex, follow docs/quick-start.md.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'scripts', 'aod.mjs');
const FAKE = join(ROOT, 'tests', 'fixtures', 'fake-codex.mjs');
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function runDemo({ slow = false, keep = false, log = console.log } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'aod-demo-'));
  const repo = join(tmp, 'demo');
  mkdirSync(repo);
  const env = { ...process.env, AOD_CODEX_CMD: JSON.stringify([process.execPath, FAKE]), FAKE_CODEX_SCENARIO: 'out-of-scope' };
  const steps = [];
  const fail = (what, r) => {
    throw new Error(`demo step failed: ${what}\n${r.stderr || ''}${r.stdout || ''}`);
  };
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (r.status !== 0) fail(`git ${args.join(' ')}`, r);
    return r.stdout.trim();
  };
  const aod = (args, expect = 0) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8', env });
    if (r.status !== expect) fail(`aod ${args.join(' ')} (exit ${r.status}, expected ${expect})`, r);
    try {
      return JSON.parse(r.stdout);
    } catch {
      return r.stdout;
    }
  };
  const step = (title, explain, fn) => {
    log(`\n▶ ${title}`);
    if (explain) log(`  ${explain}`);
    const lines = fn() || [];
    for (const l of lines) log(`    ${l}`);
    steps.push(title);
    if (slow) sleepSync(1500);
  };

  log('AOD demo: Claude is the architect, Codex the implementer. Codex is simulated here (tests/fixtures/fake-codex.mjs),');
  log('so model names show what the routing would pick, and nothing is spent.');
  try {
    step('A repository with AOD', 'aod init scaffolds .agents/ (memory, decisions, tasks), AGENTS.md, CLAUDE.md and the ledger.', () => {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 'demo@example.com');
      git('config', 'user.name', 'Demo');
      git('config', 'core.autocrlf', 'false');
      writeFileSync(join(repo, 'README.md'), '# demo\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'initial');
      const r = aod(['init', '--slots', '1']);
      git('add', '-A');
      git('commit', '-q', '-m', 'chore: set up AOD');
      return [`created ${r.created.length} files; committed on main`];
    });

    step('The architect cuts a task packet', 'Scope globs, an acceptance command and an acceptance test written before any code.', () => {
      const r = aod(['packet', 'new', 'Implement add']);
      const p = join(repo, '.agents', 'tasks', `${r.id}.md`);
      writeFileSync(p, readFileSync(p, 'utf8')
        .replace(/^ {2}- src\/\*\*$/m, '  - src/add.mjs')
        .replace(/^ {2}- <command.*$/m, '  - node tests/acceptance/add.test.mjs'));
      mkdirSync(join(repo, 'tests', 'acceptance'), { recursive: true });
      writeFileSync(join(repo, 'tests', 'acceptance', 'add.test.mjs'),
        "import assert from 'node:assert/strict';\nimport { add } from '../../src/add.mjs';\nassert.equal(add(2, 3), 5);\n");
      aod(['task', 'commit', r.id, 'tests/acceptance/add.test.mjs']);
      return [`${r.id}: scope src/add.mjs, acceptance node tests/acceptance/add.test.mjs`, `committed to task/${r.id}; main stays checked out`];
    });

    step('Preflight', 'The packet is consistent and the acceptance test fails for the right reason.', () => {
      const r = aod(['preflight', 'T-0001']);
      aod(['task', 'set', 'T-0001', 'status=ready']);
      const red = r.checks.find((c) => c.name.startsWith('red:'));
      return [`${r.checks.length} checks, ok=${r.ok}`, `red test: ${red.detail.split('\n')[0]}`];
    });

    step('Delegate to Codex', 'codex exec runs in an isolated worktree slot with a brief and a JSON report schema.', () => {
      const r = aod(['delegate', 'T-0001']);
      return [`slot ${r.slot}, model ${r.model} (${r.role}), status ${r.status}`, `report: "${r.summary}"`];
    });

    step('Gates catch a problem', 'Deterministic checks, no model tokens. The implementer also edited README.md.', () => {
      const r = aod(['gates', 'T-0001'], 1);
      return r.results.filter((x) => !x.ok).map((x) => `FAIL ${x.name}: ${x.detail}`);
    });

    step('REVISE on the same Codex thread', 'Findings go back to the implementer; the round is counted in the ledger.', () => {
      const findings = join(tmp, 'findings.md');
      writeFileSync(findings, 'F1 [blocker] README.md - outside the packet scope. Required: revert it. Verify: aod gates T-0001.\n');
      const r = aod(['revise', 'T-0001', '--findings', findings]);
      const g = aod(['gates', 'T-0001']);
      return [`round 1 done, status ${r.status}`, `gates: ${g.results.length} checks, ok=${g.ok}`];
    });

    step('Close', 'A fresh-context reviewer would read the diff here (a Claude subagent); then one squash commit on main.', () => {
      aod(['merge', 'T-0001', '--reviewed-by', 'reviewer (fresh context)', '--attention', '3']);
      return [git('log', '-1', '--format=%s'), ...git('log', '-1', '--format=%b').split('\n').filter(Boolean)];
    });

    step('Retro from the ledger', 'Methodology §18 metrics, no extra infrastructure.', () => {
      const { metrics: m, signals } = aod(['retro']);
      return [
        `first-pass acceptance ${m.first_pass_acceptance_pct}%, avg rounds ${m.avg_rounds}, scope violations ${m.scope_violations}`,
        `attention ${m.attention_minutes.total} min, uncached tokens ${m.tokens.uncached}`,
        `signal: ${signals.find((s) => /scope violation/.test(s)) || signals[0]}`,
      ];
    });

    log(`\nDone: ${steps.length} steps. ${keep ? `Repository kept at ${repo}` : 'Throwaway repository removed.'}`);
    log('Next: docs/quick-start.md runs the same loop on your machine with real Codex.');
    return { ok: true, steps, repo: keep ? repo : null };
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runDemo({ slow: process.argv.includes('--slow'), keep: process.argv.includes('--keep') });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
