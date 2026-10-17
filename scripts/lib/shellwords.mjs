// Just enough shell parsing to find git invocations in a Bash tool command.

// Split into words, honouring quotes; control operators become their own tokens.
export function tokenize(command) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let has = false;
  const push = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      // Like bash: inside double quotes a backslash only escapes $ ` " \ and newline (Windows paths survive).
      else if (ch === '\\' && quote === '"' && '$`"\\\n'.includes(command[i + 1] ?? '')) cur += command[++i];
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (ch === '\\' && i + 1 < command.length) {
      cur += command[++i];
      has = true;
    } else if (/\s/.test(ch)) {
      push();
      if (ch === '\n') tokens.push(';');
    } else if ('|&;()'.includes(ch)) {
      push();
      const two = command.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        tokens.push(two);
        i++;
      } else tokens.push(ch);
    } else {
      cur += ch;
      has = true;
    }
  }
  push();
  return tokens;
}

const OPS = new Set(['&&', '||', ';', '|', '&', '(', ')']);
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

// Returns [{ dir: string|null, sub: string, args: string[] }] for every git invocation.
export function gitInvocations(command) {
  const out = [];
  const tokens = tokenize(command);
  let i = 0;
  while (i < tokens.length) {
    let segEnd = i;
    while (segEnd < tokens.length && !OPS.has(tokens[segEnd])) segEnd++;
    const seg = tokens.slice(i, segEnd);
    // Skip env assignments and common wrappers before the command name.
    let k = 0;
    while (k < seg.length && (/^\w+=/.test(seg[k]) || ['sudo', 'command', 'env', 'exec', 'time'].includes(seg[k]))) k++;
    if (seg[k] && /(^|[\\/])git(\.exe)?$/i.test(seg[k])) {
      let dir = null;
      let j = k + 1;
      while (j < seg.length && seg[j].startsWith('-')) {
        if (seg[j] === '-C') dir = seg[j + 1] ?? null;
        j += GIT_OPTS_WITH_VALUE.has(seg[j]) ? 2 : 1;
      }
      if (j < seg.length) out.push({ dir, sub: seg[j], args: seg.slice(j + 1) });
    }
    // `cd X && git ...` changes the directory for later segments.
    if (seg[0] === 'cd' && seg[1]) out.push({ cd: seg[1] });
    i = segEnd + 1;
  }
  return out;
}
