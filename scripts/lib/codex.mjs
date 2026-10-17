// Locating and invoking the Codex CLI (see ADR-0002 for the pinned interface).
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

const isWin = process.platform === 'win32';

function onPath(name) {
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

function knownInstallDirs() {
  if (isWin) {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return [join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')];
  }
  return [join(homedir(), '.local', 'bin', 'codex'), '/usr/local/bin/codex', '/opt/homebrew/bin/codex'];
}

// Returns argv prefix, e.g. ["C:/.../codex.exe"] or ["node", "fake-codex.mjs"]; null when not found.
export function locateCodex(config = {}) {
  if (process.env.AOD_CODEX_CMD) return JSON.parse(process.env.AOD_CODEX_CMD);
  if (config.codex?.command) return Array.isArray(config.codex.command) ? config.codex.command : [config.codex.command];
  const found = onPath('codex') || knownInstallDirs().find((p) => existsSync(p));
  return found ? [found] : null;
}

// .cmd/.bat shims cannot be spawned without a shell on Windows.
export function needsShell(cmd) {
  return isWin && /\.(cmd|bat)$/i.test(cmd[0]);
}

export function execArgs({ slot, model, effort, sandbox, schemaPath, outPath }) {
  const args = ['exec', '-C', slot, '-s', sandbox || 'workspace-write'];
  if (model) args.push('-m', model);
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  args.push('--output-schema', schemaPath, '--json', '-o', outPath, '-');
  return args;
}

export function resumeArgs({ threadId, model, effort, schemaPath, outPath }) {
  const args = ['exec', 'resume', threadId];
  if (model) args.push('-m', model);
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  args.push('--output-schema', schemaPath, '--json', '-o', outPath, '-');
  return args;
}

// Fold JSONL events into job facts.
export function foldEvent(state, line) {
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return state;
  }
  if (ev.type === 'thread.started' && ev.thread_id) state.thread_id = ev.thread_id;
  if (ev.type === 'turn.completed' && ev.usage) {
    state.usage = state.usage || {};
    for (const [k, v] of Object.entries(ev.usage)) {
      if (['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'].includes(k)) {
        state.usage[k] = (state.usage[k] || 0) + v;
      }
    }
  }
  if (ev.type === 'turn.failed' || ev.type === 'error') state.error = ev.error?.message || ev.message || 'codex error';
  return state;
}
