// EARS (Easy Approach to Requirements Syntax) lint for spec requirements.
// Requirement lines look like "- R1: When <trigger>, the <system> shall <response>." and may be followed by
// an indented "Acceptance: <test reference>" line that traces the requirement to an acceptance test.

// Clauses may contain commas ("When x contains +, -, *,"): the main clause is found by ", the <system> shall".
const MAIN = String.raw`,\s+(?:then\s+)?the\s.+?\sshall\s.+`;
const PATTERNS = [
  ['ubiquitous', /^the\s.+?\sshall\s.+/i],
  ['event', new RegExp(`^when\\s.+?${MAIN}`, 'i')],
  ['state', new RegExp(`^while\\s.+?${MAIN}`, 'i')],
  ['unwanted', new RegExp(String.raw`^if\s.+?,\s+then\s+the\s.+?\sshall\s.+`, 'i')],
  ['optional', new RegExp(`^where\\s.+?${MAIN}`, 'i')],
];

// Why a sentence is not EARS, in words the author can act on.
export function earsProblem(text) {
  const t = text.trim();
  if (!/\bshall\b/i.test(t)) return 'no "shall": state the required response as "the <system> shall <response>"';
  const lead = /^(when|while|if|where)\b/i.exec(t)?.[1]?.toLowerCase();
  if (lead === 'if' && !/,\s+then\s+the\s/i.test(t)) return 'unwanted-behaviour form needs ", then the <system> shall <response>"';
  if (lead && !/,\s+(?:then\s+)?the\s.+?\sshall\s/i.test(t)) return `the "${lead}" clause must be followed by ", the <system> shall <response>"`;
  if (!lead && !/^the\s/i.test(t)) return 'start with "The <system> shall", or a When/While/If/Where clause';
  return 'does not match an EARS pattern';
}
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
    if (!r.kind) errors.push(`${r.id} (line ${r.line}): not EARS: ${earsProblem(r.text)}`);
    if ((r.text.match(/\bshall\b/gi) || []).length > 1) warnings.push(`${r.id}: more than one "shall"; split into separate requirements`);
    const weak = WEAK.exec(r.text);
    if (weak) warnings.push(`${r.id}: vague word "${weak[1]}"; make it testable`);
    if (!r.acceptance) warnings.push(`${r.id}: no "Acceptance:" line tracing it to an acceptance test`);
  }
  return { requirements, errors, warnings };
}
