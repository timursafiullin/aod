// Model routing (ADR-0006): roles implement / escalate / explore, presets, escalation by evidence.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PRESETS = {
  max: {
    implement: { model: 'gpt-6.1-sol', effort: 'medium' },
    escalate: { model: 'gpt-6.1-sol', effort: 'high' },
    explore: { model: 'gpt-6-luna', effort: 'low' },
  },
  balanced: {
    implement: { model: 'gpt-6-luna', effort: 'medium' },
    escalate: { model: 'gpt-6.1-sol', effort: 'high' },
    explore: { model: 'gpt-5.6-luna', effort: 'low' },
  },
  economy: {
    implement: { model: 'gpt-5.6-terra', effort: 'medium' },
    escalate: { model: 'gpt-6.1-sol', effort: 'high' },
    explore: { model: 'gpt-5.6-luna', effort: 'low' },
  },
};

export function routing(config) {
  const r = config.routing || {};
  const base = PRESETS[r.preset] || PRESETS.max;
  return {
    preset: r.preset || 'max',
    implement: { ...base.implement, ...(r.implement || {}) },
    escalate: { ...base.escalate, ...(r.escalate || {}) },
    explore: { ...base.explore, ...(r.explore || {}) },
  };
}

// Which role a job gets: escalate after a failed job (delegate) or from review round 2 (revise).
export function roleFor(task, { kind, round = 0 }) {
  if (kind === 'revise') return round >= 2 ? 'escalate' : 'implement';
  return (task.failures || 0) >= 1 ? 'escalate' : 'implement';
}

// Precedence: CLI flag > packet front matter > routing role. (codex.model/effort from 0.4 configs are ignored.)
export function pickModel(config, task, packet, flags, job) {
  const role = roleFor(task, job);
  const r = routing(config)[role];
  return {
    role,
    model: flags.model || packet.model || r.model || null,
    effort: flags.effort || packet.effort || r.effort || null,
  };
}

export function knownModels() {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  const p = join(home, 'models_cache.json');
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return (data.models || []).map((m) => m.slug).filter(Boolean);
  } catch {
    return null;
  }
}

// Codex prints these when the plan's usage window or the API rate limit is exhausted.
export const QUOTA_RE = /usage limit|rate[ _-]?limit|quota|insufficient_quota|\b429\b|try again (?:in|at)/i;
