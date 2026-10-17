#!/usr/bin/env node
// Stand-in for `codex exec` in tests. Behaviour is chosen by FAKE_CODEX_SCENARIO:
//   good | out-of-scope | skip | blocked. On `exec resume` it repairs out-of-scope/skip damage.
// Like real Codex under workspace-write it never commits (.git is read-only); AOD commits for it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  console.log('codex-cli 0.0.0-fake');
  process.exit(0);
}
const resume = argv[1] === 'resume';
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const dir = opt('-C') || process.cwd();
const out = opt('-o');
const brief = readFileSync(0, 'utf8');
const id = /T-\d{4}/.exec(brief)?.[0] || 'T-0000';
const scenario = process.env.FAKE_CODEX_SCENARIO || 'good';
const threadId = resume ? argv[2] : '00000000-0000-4000-8000-000000000001';

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const write = (rel, text) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const emit = (ev) => process.stdout.write(`${JSON.stringify(ev)}\n`);

emit({ type: 'thread.started', thread_id: threadId });
emit({ type: 'turn.started' });

let status = 'done';
const questions = [];
if (scenario === 'blocked' && !resume) {
  status = 'blocked';
  questions.push('Should add() accept strings?');
} else if (!resume) {
  write('src/add.mjs', 'export const add = (a, b) => a + b;\n');
  if (scenario === 'out-of-scope') write('README.md', 'changed by implementer\n');
  if (scenario === 'skip') write('src/add.test.mjs', "import { test } from 'node:test';\ntest.skip('later', () => {});\n");
} else {
  if (scenario === 'out-of-scope') git('checkout', `task/${id}`, '--', 'README.md');
  if (scenario === 'skip') write('src/add.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { add } from './add.mjs';\ntest('adds', () => assert.equal(add(1, 2), 3));\n");
  if (scenario === 'blocked') write('src/add.mjs', 'export const add = (a, b) => a + b;\n');
}

const report = {
  task_id: id,
  status,
  summary: status === 'done' ? 'Implemented add.' : 'Need a decision.',
  commits: [],
  files_changed: status === 'done' ? ['src/add.mjs'] : [],
  checks: [],
  deviations: [],
  open_questions: questions,
  risks: [],
};
writeFileSync(out, JSON.stringify(report));
emit({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: JSON.stringify(report) } });
emit({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 10 } });
