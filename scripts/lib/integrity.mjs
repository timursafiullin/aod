// Test-integrity heuristics (verify ladder level 2). Each finding is a gate result:
// level "fail" blocks the merge, level "warn" is shown to the reviewer.
import { matchesAny } from './glob.mjs';

const SKIP_MARKERS = [
  /\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(/, /\bx(?:it|describe|test)\s*\(/, /@pytest\.mark\.(?:skip|xfail)/,
  /\bpytest\.(?:skip|xfail)\s*\(/, /#\[ignore\]/, /\bt\.Skip(?:Now|f)?\s*\(/, /@(?:Disabled|Ignore)\b/, /\bunittest\.skip/,
];
const TEST_DETECTION = [
  /process\.env\.(?:NODE_ENV|JEST_WORKER_ID|VITEST|NODE_TEST_CONTEXT)\b/, /PYTEST_CURRENT_TEST/, /['"]pytest['"]\s+in\s+sys\.modules/,
  /import\.meta\.vitest/, /testing\.Testing\(\)/, /\bisTest(?:Env|ing)?\b/,
];
const TOLERANCE = /\b(?:rtol|atol|tol|tolerance|epsilon|eps|delta|places|precision|toBeCloseTo|approx|assertAlmostEqual)\b/i;

// Parse a unified diff (-U0) into { file -> { added: [], removed: [] } }.
export function parseDiff(diffText) {
  const files = {};
  let file = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.slice(4).replace(/^b\//, '');
      files[file] = files[file] || { added: [], removed: [] };
    } else if (line.startsWith('--- ')) {
      continue;
    } else if (file && line.startsWith('+')) files[file].added.push(line.slice(1));
    else if (file && line.startsWith('-')) files[file].removed.push(line.slice(1));
  }
  return files;
}

export function skipMarkers(diffText) {
  const hits = [];
  for (const [file, { added }] of Object.entries(parseDiff(diffText))) {
    for (const line of added) if (SKIP_MARKERS.some((re) => re.test(line))) hits.push(`${file}: ${line.trim()}`);
  }
  return hits;
}

// Literals an implementer could special-case: numbers with 2+ digits and strings of 3+ chars from acceptance tests.
export function acceptanceLiterals(sources) {
  const lits = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/(?<![\w.])-?\d{2,}(?:\.\d+)?(?![\w.])/g)) lits.add(m[0]);
    for (const m of src.matchAll(/(['"])((?:(?!\1)[^\\\n]){3,60})\1/g)) lits.add(JSON.stringify(m[2]));
  }
  return lits;
}

function comparedLiterals(line) {
  const out = [];
  const lit = String.raw`(-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*")`;
  for (const re of [new RegExp(`(?:===?|!==?|\\bcase)\\s*${lit}`, 'g'), new RegExp(`${lit}\\s*(?:===?|!==?)`, 'g')]) {
    for (const m of line.matchAll(re)) {
      const v = m[1];
      out.push(/^['"]/.test(v) ? JSON.stringify(v.slice(1, -1)) : v);
    }
  }
  return out;
}

/**
 * @param {object} p
 * @param {string} p.diffText      git diff -U0 task...codex
 * @param {string} p.nameStatus    git diff --name-status task...codex
 * @param {string[]} p.testGlobs
 * @param {string[]} p.acceptanceSources  contents of the acceptance test files
 */
export function integrityChecks({ diffText, nameStatus, testGlobs, acceptanceSources = [] }) {
  const results = [];
  const add = (name, ok, detail, level = 'fail') => results.push({ name, ok, level: ok ? 'pass' : level, detail });
  const isTest = (f) => matchesAny(f, testGlobs);
  const files = parseDiff(diffText);

  const changes = nameStatus.split('\n').filter(Boolean).map((l) => {
    const [status, ...paths] = l.split('\t');
    return { status: status[0], path: paths[paths.length - 1], from: paths[0] };
  });
  const deleted = changes.filter((c) => (c.status === 'D' || c.status === 'R') && isTest(c.from)).map((c) => c.from);
  add('no-deleted-tests', deleted.length === 0, deleted.length ? `test files deleted or renamed: ${deleted.join(', ')}` : 'none');

  const markers = skipMarkers(diffText);
  add('no-skips', markers.length === 0, markers.length ? markers.join('; ') : 'no skip/only/xfail markers added');

  const detection = [];
  for (const [file, { added }] of Object.entries(files)) {
    if (isTest(file)) continue;
    for (const line of added) if (TEST_DETECTION.some((re) => re.test(line))) detection.push(`${file}: ${line.trim()}`);
  }
  add('no-test-detection', detection.length === 0, detection.length ? `production code checks for a test run: ${detection.join('; ')}` : 'none');

  const modified = changes.filter((c) => c.status === 'M' && isTest(c.path)).map((c) => c.path);
  add('existing-tests-untouched', modified.length === 0, modified.length ? `existing tests modified (check they were not weakened): ${modified.join(', ')}` : 'none', 'warn');

  const tolerance = [];
  for (const [file, { added, removed }] of Object.entries(files)) {
    if (added.some((l) => TOLERANCE.test(l) && /\d/.test(l)) && removed.some((l) => TOLERANCE.test(l) && /\d/.test(l))) tolerance.push(file);
  }
  add('tolerances-unchanged', tolerance.length === 0, tolerance.length ? `tolerance values changed in: ${tolerance.join(', ')}` : 'none', 'warn');

  const lits = acceptanceLiterals(acceptanceSources);
  const special = [];
  for (const [file, { added }] of Object.entries(files)) {
    if (isTest(file)) continue;
    for (const line of added) {
      const hit = comparedLiterals(line).filter((v) => lits.has(v));
      if (hit.length) special.push(`${file}: ${line.trim()}`);
    }
  }
  add('no-special-casing', special.length === 0, special.length ? `production code compares against acceptance-test literals: ${special.slice(0, 5).join('; ')}` : 'none', 'warn');
  return results;
}
