// Environment checks for AOD. Pure functions take an injectable `run` so tests need no real tools.
import { spawnSync } from 'node:child_process';
import { locateCodex, needsShell } from './codex.mjs';

export const MIN_NODE_MAJOR = 20;
export const MIN_GIT = [2, 38]; // git merge-tree --write-tree

export function defaultRun(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: needsShell([cmd]) });
  if (res.error || res.status !== 0) return null;
  return (res.stdout || res.stderr || '').trim();
}

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text || '');
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], raw: m[0] } : null;
}

// Each check: { id, required, run(ctx) -> { ok, detail, hint? } }
export const CHECKS = [
  {
    id: 'node',
    required: true,
    run: ({ nodeVersion }) => {
      const v = parseVersion(nodeVersion);
      const ok = !!v && v.major >= MIN_NODE_MAJOR;
      return { ok, detail: nodeVersion, hint: ok ? undefined : `Install Node.js >= ${MIN_NODE_MAJOR}` };
    },
  },
  {
    id: 'git',
    required: true,
    run: ({ run }) => {
      const out = run('git', ['--version']);
      const v = parseVersion(out);
      const ok = !!v && (v.major > MIN_GIT[0] || (v.major === MIN_GIT[0] && v.minor >= MIN_GIT[1]));
      return { ok, detail: out || 'not found', hint: ok ? undefined : `Install git >= ${MIN_GIT.join('.')} and add it to PATH` };
    },
  },
  {
    id: 'git-worktree',
    required: true,
    run: ({ run }) => {
      const out = run('git', ['worktree', 'list']);
      return {
        ok: out !== null,
        detail: out === null ? 'not inside a git repository' : 'ok',
        hint: out === null ? 'Run AOD inside a git repository (git init)' : undefined,
      };
    },
  },
  {
    id: 'codex',
    required: false,
    run: ({ run, locate }) => {
      const cmd = locate();
      const out = cmd ? run(cmd[0], [...cmd.slice(1), '--version']) : null;
      return {
        ok: !!out,
        detail: out || 'not found',
        hint: out ? undefined : 'Optional implementer: npm i -g @openai/codex, then `codex login`. Without it AOD runs in Claude-only mode.',
      };
    },
  },
  {
    id: 'claude',
    required: false,
    run: ({ run }) => {
      const out = run('claude', ['--version']);
      return { ok: !!out, detail: out || 'not found' };
    },
  },
];

export function runDoctor(ctx = {}) {
  const full = { run: defaultRun, nodeVersion: process.version, locate: () => locateCodex(), ...ctx };
  const results = CHECKS.map((c) => ({ id: c.id, required: c.required, ...c.run(full) }));
  const ok = results.every((r) => r.ok || !r.required);
  const mode = results.find((r) => r.id === 'codex')?.ok ? 'claude+codex' : 'claude-only';
  return { ok, mode, results };
}

export function formatDoctor({ ok, mode, results }) {
  const lines = results.map((r) => {
    const mark = r.ok ? 'ok  ' : r.required ? 'FAIL' : 'warn';
    return `[${mark}] ${r.id.padEnd(13)} ${r.detail}${r.hint ? `\n       -> ${r.hint}` : ''}`;
  });
  lines.push('', `mode: ${mode}`, ok ? 'AOD environment is ready.' : 'AOD environment is NOT ready.');
  return lines.join('\n');
}
