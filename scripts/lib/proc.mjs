// Process helpers: git and shell commands with predictable errors.
import { spawnSync } from 'node:child_process';

export class AodError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export function git(args, cwd, { allowFail = false, env } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : undefined });
  if (res.error) throw new AodError(`git not available: ${res.error.message}`);
  if (res.status !== 0 && !allowFail) {
    throw new AodError(`git ${args.join(' ')} failed in ${cwd}:\n${(res.stderr || res.stdout).trim()}`);
  }
  return allowFail ? { ok: res.status === 0, out: res.stdout.trim(), err: res.stderr.trim() } : res.stdout.trim();
}

export function branchExists(cwd, branch) {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd, { allowFail: true }).ok;
}

export function isClean(cwd) {
  return git(['status', '--porcelain'], cwd) === '';
}

// Run a shell command (acceptance commands are shell strings by design).
export function sh(command, cwd, timeoutMs = 30 * 60 * 1000) {
  const res = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  return { cmd: command, exit_code: res.status ?? -1, tail: output.slice(-2000), output, timed_out: res.error?.code === 'ETIMEDOUT' };
}

export const now = () => new Date().toISOString();
