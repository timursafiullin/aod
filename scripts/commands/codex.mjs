// aod route show|preset, aod review (cross-family review of Claude-written changes), aod explore (read-only Codex)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { needsShell } from '../lib/codex.mjs';
import { openProject, readJson, requireInitialized, writeJson } from '../lib/project.mjs';
import { AodError, now } from '../lib/proc.mjs';
import { PRESETS, QUOTA_RE, knownModels, routing } from '../lib/routing.mjs';
import { EXIT, requireCodex } from './run.mjs';

export function routeShow({ cwd }) {
  const project = requireInitialized(openProject(cwd));
  const r = routing(project.config);
  const known = knownModels();
  const unknown = known ? ['implement', 'escalate', 'explore'].map((k) => r[k].model).filter((m) => m && !known.includes(m)) : [];
  return {
    ...r,
    presets: Object.keys(PRESETS),
    ...(known ? { available_models: known } : { note: 'no ~/.codex/models_cache.json; model names not verified' }),
    ...(unknown.length ? { warnings: [`not in your Codex model list: ${[...new Set(unknown)].join(', ')}`] } : {}),
  };
}

export function routePreset({ cwd, args }) {
  const project = requireInitialized(openProject(cwd));
  const name = args[0];
  if (!PRESETS[name]) throw new AodError(`unknown preset "${name}" (${Object.keys(PRESETS).join(', ')})`, 2);
  const cfg = readJson(project.configPath);
  cfg.routing = { preset: name, ...JSON.parse(JSON.stringify(PRESETS[name])) };
  writeJson(project.configPath, cfg);
  return { preset: name, ...cfg.routing, note: 'packet model/effort and CLI flags still override the routing' };
}

function runCodexSync(project, cmd, args, input, cwd) {
  const res = spawnSync(cmd[0], [...cmd.slice(1), ...args], {
    cwd, input, encoding: 'utf8', shell: needsShell(cmd), timeout: 45 * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  const stderr = res.stderr || '';
  if (res.status !== 0 && QUOTA_RE.test(stderr)) {
    throw new AodError(`Codex is out of quota: ${stderr.trim().split('\n').pop()}\nStop and ask the user (ADR-0006).`, EXIT.UNAVAILABLE);
  }
  if (res.error || res.status !== 0) throw new AodError(`codex failed (exit ${res.status}): ${(res.error?.message || stderr).slice(-1500)}`);
  return res.stdout || '';
}

const effortArg = (e) => (e ? ['-c', `model_reasoning_effort="${e}"`] : []);

// Cross-family review of changes the architect made itself (UI, security core, small fixes).
export function review({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  const cmd = requireCodex(project);
  const target = flags.commit ? ['--commit', String(flags.commit)]
    : flags.uncommitted ? ['--uncommitted']
      : ['--base', typeof flags.base === 'string' ? flags.base : project.config.base_branch];
  const { model, effort } = routing(project.config).implement;
  const modelArgs = [...(model ? ['-m', model] : []), ...effortArg(effort)];
  // codex-cli 0.163: a target flag (--base/--commit/--uncommitted) cannot be combined with custom instructions.
  // With --focus we use the custom-instructions mode and name the diff to review in the prompt instead.
  let args;
  let input;
  if (typeof flags.focus === 'string') {
    const diff = flags.commit ? `git show ${flags.commit}` : flags.uncommitted ? 'git diff HEAD plus untracked files'
      : `git diff ${target[1]}...HEAD`;
    input = [
      `Review the changes shown by \`${diff}\` as an independent reviewer from another model family.`,
      'Check correctness against .agents/context/invariants.md and any spec or ADR the changes touch.',
      `Focus: ${flags.focus}`,
      'Report each finding as: F<n> [blocker|major|minor] path:line - problem. Required: change.',
    ].join('\n');
    args = ['exec', 'review', ...modelArgs, '-'];
  } else {
    args = ['exec', 'review', ...target, ...modelArgs];
  }
  const out = runCodexSync(project, cmd, args, input, project.root);
  const dir = join(project.tasksDir, 'jobs', 'reviews');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${now().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, out);
  const findings = out.split('\n').filter((l) => /\bF\d+\s*\[(blocker|major|minor)\]/i.test(l));
  return {
    target: target.join(' '), model, saved: file.slice(project.root.length + 1).replace(/\\/g, '/'),
    blockers: findings.filter((l) => /\[blocker\]/i.test(l)).length, findings,
    tail: findings.length ? undefined : out.trim().split('\n').slice(-25).join('\n'),
  };
}

// Read-only research by a cheap model, answer cites path:line (methodology §16.2 short brief).
export function explore({ cwd, args, flags }) {
  const project = requireInitialized(openProject(cwd));
  const question = args.join(' ').trim();
  if (!question) throw new AodError('usage: aod explore "<one precise question>" [--lines 30]', 2);
  const cmd = requireCodex(project);
  const { model, effort } = routing(project.config).explore;
  const lines = Number(flags.lines) || 30;
  const prompt = [
    '<role>Read-only research assistant. Do not modify any file, do not run commands that change state.</role>',
    `<question>${question}</question>`,
    `<output_format>At most ${lines} lines. Every claim cites path:line. Write "unknown" instead of guessing.</output_format>`,
  ].join('\n');
  const dir = join(project.tasksDir, 'jobs', 'explore');
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${now().replace(/[:.]/g, '-')}.md`);
  runCodexSync(project, cmd, ['exec', '-C', project.root, '-s', 'read-only', '--ephemeral',
    ...(model ? ['-m', model] : []), ...effortArg(effort), '-o', outPath, '-'], prompt, project.root);
  return { raw: readFileSync(outPath, 'utf8') };
}
