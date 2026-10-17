// Mutation-testing adapter for aod gates (ADR-0007): tool-agnostic command, score parsed from its output.
// Catches tests that pass without checking anything (reward hacking the integrity checks cannot see).
import { matchesAny } from './glob.mjs';
import { sh } from './proc.mjs';

// Known report lines, most specific first. Each returns a score in percent or null.
const pair = (a, b) => (out) => {
  const x = a.exec(out);
  const y = b.exec(out);
  return x && y ? ratio(Number(x[1]), Number(y[1])) : null;
};
const PARSERS = [
  (out) => num(/Final mutation score of ([\d.]+)/i.exec(out)), // Stryker (JS/TS, .NET, Scala)
  (out) => num(/Mutation Score Indicator \(MSI\):\s*([\d.]+)\s*%/i.exec(out)), // Infection (PHP)
  (out) => num(/Generated \d+ mutations Killed \d+ \(([\d.]+)%\)/i.exec(out)), // PIT (Java)
  pair(/(\d+) caught/i, /(\d+) missed/i), // cargo-mutants (Rust)
  pair(/killed\W+(\d+)/i, /survived\W+(\d+)/i), // mutmut and generic killed/survived counts
  (out) => num(/mutation score[^\d\n]*([\d.]+)/i.exec(out)), // Mull and generic summaries
];
function num(m) {
  return m ? Number(m[1]) : null;
}

function ratio(killed, survived) {
  return killed + survived ? Math.round((killed / (killed + survived)) * 1000) / 10 : null;
}

export function parseMutationScore(output, customRegex) {
  if (customRegex) {
    const m = new RegExp(customRegex, 'i').exec(output);
    return m ? Number(m[1]) : null;
  }
  for (const parse of PARSERS) {
    const v = parse(output);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// Changed source files worth mutating: not tests, not forbidden contracts, and matching mutation.include if set.
export function mutationTargets(files, { testGlobs = [], include = [] }) {
  return files.filter((f) => !matchesAny(f, testGlobs) && (!include.length || matchesAny(f, include)));
}

const quote = (f) => (/^[\w./-]+$/.test(f) ? f : `"${f.replace(/"/g, '\\"')}"`);

// Returns a gates result row: { name, ok, level, detail }. Never throws.
export function mutationGate(cfg, files, cwd, testGlobs) {
  const name = 'mutation';
  const targets = mutationTargets(files, { testGlobs, include: cfg.include || [] });
  if (!targets.length) return { name, ok: true, level: 'pass', detail: 'no changed source files to mutate' };
  const cmd = cfg.command.includes('{files}') ? cfg.command.replace('{files}', targets.map(quote).join(' ')) : cfg.command;
  const res = sh(cmd, cwd, (cfg.timeout_minutes || 20) * 60_000);
  const level = cfg.level === 'fail' ? 'fail' : 'warn';
  if (res.timed_out) return { name, ok: false, level: 'warn', detail: `timed out after ${cfg.timeout_minutes} min: ${cmd}` };
  const score = parseMutationScore(res.output, cfg.score_regex);
  if (score === null) {
    return { name, ok: false, level: 'warn', detail: `no mutation score found (exit ${res.exit_code}); set mutation.score_regex\n${res.tail.slice(-600)}` };
  }
  const ok = score >= cfg.threshold;
  return {
    name, ok, level: ok ? 'pass' : level, score,
    detail: `${score}% on ${targets.length} file(s), threshold ${cfg.threshold}%${ok ? '' : ': surviving mutants mean the tests do not check this code'}`,
  };
}
