// Minimal YAML front matter: the subset AOD packets use (scalars, inline lists, block lists, comments).

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function splitFrontmatter(text) {
  const m = FM.exec(text);
  if (!m) throw new Error('missing front matter (expected leading --- block)');
  return { yaml: m[1], body: m[2] };
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

function splitInline(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  if (s.startsWith('[') && s.endsWith(']')) return splitInline(s.slice(1, -1)).map(parseScalar);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

export function parseYaml(yaml) {
  const obj = {};
  let listKey = null;
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      obj[listKey].push(parseScalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!kv) throw new Error(`unsupported front matter line: ${rawLine}`);
    const [, key, value] = kv;
    if (value === undefined || value.trim() === '') {
      obj[key] = [];
      listKey = key;
    } else {
      obj[key] = parseScalar(value);
      listKey = null;
    }
  }
  return obj;
}

export function parseFrontmatter(text) {
  const { yaml, body } = splitFrontmatter(text);
  return { data: parseYaml(yaml), body };
}
