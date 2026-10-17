// EARS (Easy Approach to Requirements Syntax) lint for spec requirements.
// Requirement lines look like "- R1: When <trigger>, the <system> shall <response>." and may be followed by
// an indented "Acceptance: <test reference>" line that traces the requirement to an acceptance test.

const PATTERNS = [
  ['ubiquitous', /^the\s.+?\sshall\s.+/i],
  ['event', /^when\s[^,]+,\s+the\s.+?\sshall\s.+/i],
  ['state', /^while\s[^,]+,\s+(?:when\s[^,]+,\s+)?the\s.+?\sshall\s.+/i],
  ['unwanted', /^if\s[^,]+,\s+then\s+the\s.+?\sshall\s.+/i],
  ['optional', /^where\s[^,]+,\s+(?:when\s[^,]+,\s+)?the\s.+?\sshall\s.+/i],
];
const WEAK = /\b(should|may|might|could|etc\.?|and\/or|as appropriate|if possible|user[- ]friendly|fast|easy|robust|approximately|some)\b/i;

export function earsKind(text) {
  const hit = PATTERNS.find(([, re]) => re.test(text.trim()));
  return hit ? hit[0] : null;
}

export function parseRequirements(markdown) {
  const reqs = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*[-*]\s+(R\d+):\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    const req = { id: m[1], text: m[2].trim(), acceptance: null, line: i + 1 };
    const next = lines[i + 1] || '';
    const acc = /^\s+Acceptance:\s*(.+)$/.exec(next);
    if (acc) req.acceptance = acc[1].trim();
    reqs.push(req);
  }
  return reqs;
}

// Returns { requirements, errors[], warnings[] }.
export function lintSpec(markdown) {
  const requirements = parseRequirements(markdown);
  const errors = [];
  const warnings = [];
  if (!requirements.length) errors.push('no requirements found (expected lines like "- R1: When ..., the system shall ...")');
  const seen = new Set();
  for (const r of requirements) {
    if (seen.has(r.id)) errors.push(`${r.id}: duplicate id`);
    seen.add(r.id);
    r.kind = earsKind(r.text);
    if (!r.kind) errors.push(`${r.id} (line ${r.line}): not EARS — use "The <system> shall ...", "When <trigger>, the <system> shall ...", "While <state>, ...", "If <condition>, then the <system> shall ..." or "Where <feature>, ..."`);
    if ((r.text.match(/\bshall\b/gi) || []).length > 1) warnings.push(`${r.id}: more than one "shall"; split into separate requirements`);
    const weak = WEAK.exec(r.text);
    if (weak) warnings.push(`${r.id}: vague word "${weak[1]}"; make it testable`);
    if (!r.acceptance) warnings.push(`${r.id}: no "Acceptance:" line tracing it to an acceptance test`);
  }
  return { requirements, errors, warnings };
}
