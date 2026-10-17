// aod retro: loop metrics (methodology §18, research §2: attention minutes and pool share) from the ledger alone.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadIndex, openProject, requireInitialized } from '../lib/project.mjs';
import { AodError } from '../lib/proc.mjs';
import { today } from './memory.mjs';

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const minutesBetween = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
// Codex reports cached_input_tokens as a subset of input_tokens. Re-sent context is mostly cache hits, so
// "uncached" (fresh input + output) is the number that tracks cost; the pool share is computed from it.
const tokens = (t) => {
  const u = t.usage || {};
  const input = u.input_tokens || 0;
  const cached = Math.min(u.cached_input_tokens || 0, input);
  const total = input + (u.output_tokens || 0);
  return { total, cached, uncached: total - cached };
};
const has = (t, type) => (t.events || []).some((e) => e.type === type);
const count = (t, type) => (t.events || []).filter((e) => e.type === type).length;

export function computeMetrics(tasks, { pool } = {}) {
  const delegated = tasks.filter((t) => t.owner === 'codex' && (t.started || has(t, 'delegated') || t.status === 'done'));
  const done = tasks.filter((t) => t.status === 'done');
  const doneCodex = done.filter((t) => t.owner === 'codex');
  const elapsed = doneCodex.map((t) => minutesBetween(t.started, t.finished)).filter((m) => m !== null && m >= 0);
  const attention = tasks.map((t) => t.attention_minutes).filter((m) => typeof m === 'number');
  const tok = tasks.map(tokens).reduce((a, x) => ({
    total: a.total + x.total, cached: a.cached + x.cached, uncached: a.uncached + x.uncached,
  }), { total: 0, cached: 0, uncached: 0 });
  const perDone = (n) => (doneCodex.length ? Math.round(n / doneCodex.length) : null);
  const byModel = {};
  for (const t of doneCodex) {
    const m = (byModel[t.model || 'default'] ||= { tasks: 0, first_pass: 0, rounds: [] });
    m.tasks += 1;
    m.first_pass += t.rounds === 0 ? 1 : 0;
    m.rounds.push(t.rounds);
  }
  const waves = [...new Set(tasks.map((t) => t.wave).filter(Boolean))];
  return {
    tasks: tasks.length,
    delegated: delegated.length,
    done: done.length,
    first_pass_acceptance_pct: pct(doneCodex.filter((t) => t.rounds === 0).length, doneCodex.length),
    avg_rounds: avg(doneCodex.map((t) => t.rounds)),
    blocked_rate_pct: pct(delegated.filter((t) => has(t, 'blocked') || t.status === 'blocked').length, delegated.length),
    escalation_rate_pct: pct(delegated.filter((t) => has(t, 'escalated') || t.status === 'escalated').length, delegated.length),
    elapsed_minutes: { median: median(elapsed), avg: avg(elapsed) },
    scope_violations: tasks.reduce((a, t) => a + count(t, 'scope-violation'), 0),
    gate_failures: tasks.reduce((a, t) => a + count(t, 'gates-fail') + count(t, 'scope-violation'), 0),
    failed_jobs: tasks.reduce((a, t) => a + (t.failures || 0), 0),
    rejected: tasks.reduce((a, t) => a + (t.verdicts || []).filter((v) => v === 'REJECT').length, 0),
    quota_stops: tasks.reduce((a, t) => a + count(t, 'unavailable'), 0),
    architect_share_pct: pct(done.filter((t) => t.owner === 'claude').length, done.length),
    attention_minutes: { total: attention.reduce((a, b) => a + b, 0), per_task: avg(attention), recorded_on: attention.length },
    tokens: {
      total: tok.total, cached_input: tok.cached, uncached: tok.uncached, cache_hit_pct: pct(tok.cached, tok.total),
      per_done_task: perDone(tok.total), uncached_per_done_task: perDone(tok.uncached),
    },
    pool_pct: pool ? pct(tok.uncached, pool) : null,
    waves: { count: waves.length, parallel_tasks: tasks.filter((t) => t.wave).length },
    by_model: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, {
      tasks: v.tasks, first_pass_pct: pct(v.first_pass, v.tasks), avg_rounds: avg(v.rounds),
    }])),
  };
}

// Signals from §18. Thresholds other than "avg rounds > 1.5" and "any scope violation" are AOD defaults.
export function signals(m) {
  const out = [];
  if (m.done < 3) out.push('Fewer than 3 closed tasks: the numbers are anecdotes, not a trend.');
  if (m.first_pass_acceptance_pct !== null && m.first_pass_acceptance_pct < 60) out.push(`First-pass acceptance ${m.first_pass_acceptance_pct}%: tighten specs and preflight (packets, acceptance tests, context).`);
  if (m.avg_rounds !== null && m.avg_rounds > 1.5) out.push(`Average rounds ${m.avg_rounds} > 1.5: tasks are too large or ambiguous; split them.`);
  if (m.blocked_rate_pct > 20) out.push(`Blocked rate ${m.blocked_rate_pct}%: packets lack decisions; write ADRs before delegating.`);
  if (m.escalation_rate_pct > 10) out.push(`Escalation rate ${m.escalation_rate_pct}%: the architecture is under-specified; more ADRs.`);
  if (m.scope_violations > 0) out.push(`${m.scope_violations} scope violation(s): review each one (packet scope too narrow, or implementer drift).`);
  if (m.failed_jobs > 0) out.push(`${m.failed_jobs} failed job(s): check stderr.log patterns (environment, budget, idle timeouts).`);
  if (m.architect_share_pct !== null && m.architect_share_pct > 40) out.push(`Architect did ${m.architect_share_pct}% of closed tasks: revisit the delegation threshold.`);
  if (m.done && !m.attention_minutes.recorded_on) out.push('No attention minutes recorded: pass --attention N to aod merge to learn what the loop costs you.');
  if (m.pool_pct !== null && m.pool_pct > 80) out.push(`Uncached token use is ${m.pool_pct}% of the configured pool: consider aod route preset balanced or economy.`);
  if (!out.length) out.push('No warning signals.');
  return out;
}

function renderMarkdown(m, sig, label) {
  const v = (x, unit = '') => (x === null || x === undefined ? 'n/a' : `${x}${unit}`);
  const rows = [
    ['First-pass acceptance', v(m.first_pass_acceptance_pct, '%'), 'Packet and brief quality'],
    ['Average rounds', v(m.avg_rounds), '> 1.5: tasks too large or ambiguous'],
    ['Blocked rate', v(m.blocked_rate_pct, '%'), 'Packet completeness'],
    ['Escalation rate', v(m.escalation_rate_pct, '%'), 'How often the PO is needed'],
    ['Elapsed per task (median / avg)', `${v(m.elapsed_minutes.median, ' min')} / ${v(m.elapsed_minutes.avg, ' min')}`, 'Throughput'],
    ['Scope violations', v(m.scope_violations), 'Any non-zero value: review it'],
    ['Gate failures / failed jobs / rejects', `${m.gate_failures} / ${m.failed_jobs} / ${m.rejected}`, 'Implementer and environment health'],
    ['Architect share of closed tasks', v(m.architect_share_pct, '%'), 'Delegation efficiency'],
    ['Attention minutes (total / per task)', `${m.attention_minutes.total} / ${v(m.attention_minutes.per_task)}`, `recorded on ${m.attention_minutes.recorded_on} task(s)`],
    ['Uncached tokens (total / per done task)', `${m.tokens.uncached} / ${v(m.tokens.uncached_per_done_task)}`, m.pool_pct === null ? 'Cost driver; set retro.weekly_token_pool for pool %' : `${m.pool_pct}% of the pool`],
    ['Cached input tokens', `${m.tokens.cached_input} (${v(m.tokens.cache_hit_pct, '%')} of ${m.tokens.total})`, 'Re-sent context served from cache'],
    ['Waves', `${m.waves.count} (${m.waves.parallel_tasks} tasks)`, 'Parallel delegation'],
  ];
  const models = Object.entries(m.by_model).map(([k, x]) => `| ${k} | ${x.tasks} | ${v(x.first_pass_pct, '%')} | ${v(x.avg_rounds)} |`);
  return [
    `# Retro ${label}`,
    '',
    `Generated by \`aod retro\` on ${today()} from \`.agents/tasks/index.json\`: ${m.tasks} task(s), ${m.delegated} delegated, ${m.done} done.`,
    '',
    '| Metric | Value | Reads as |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    '## By model',
    '',
    '| Model | Done | First pass | Avg rounds |',
    '| --- | --- | --- | --- |',
    ...(models.length ? models : ['| none | 0 | n/a | n/a |']),
    '',
    '## Signals',
    '',
    ...sig.map((s) => `- ${s}`),
    '',
    '## Actions',
    '',
    '- (architect) One change to packets, playbooks or templates per signal above, or "none".',
    '',
  ].join('\n');
}

export function retro({ cwd, flags }) {
  const project = requireInitialized(openProject(cwd));
  if (flags.since && !/^\d{4}-\d{2}-\d{2}$/.test(flags.since)) throw new AodError('--since must be YYYY-MM-DD', 2);
  const tasks = loadIndex(project).tasks
    .filter((t) => !flags.milestone || t.milestone === flags.milestone)
    .filter((t) => !flags.since || (t.created || '') >= flags.since);
  const metrics = computeMetrics(tasks, { pool: project.config.retro?.weekly_token_pool });
  const sig = signals(metrics);
  const label = [flags.milestone, flags.since ? `since ${flags.since}` : null].filter(Boolean).join(' ') || today();
  const out = { scope: { milestone: flags.milestone || null, since: flags.since || null }, metrics, signals: sig };
  if (flags.write) {
    const rel = `.agents/plans/retro-${today()}${flags.milestone ? `-${String(flags.milestone).toLowerCase()}` : ''}.md`;
    mkdirSync(join(project.root, '.agents', 'plans'), { recursive: true });
    writeFileSync(join(project.root, rel), renderMarkdown(metrics, sig, label));
    out.written = rel;
    out.next = 'Fill in the Actions section, then commit it with the session (aod session end --commit)';
  }
  return out;
}
