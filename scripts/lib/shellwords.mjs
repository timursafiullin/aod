// Just enough shell parsing to find git invocations and file writes in a Bash tool command.
// It is a guard, not a shell: aliases, eval, scripts and interpreters writing files are not seen.

const REDIRECTS = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<', '<<', '<<<']);

// Split into words, honouring quotes; control and redirection operators become their own tokens.
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
    } else if (ch === '>' || ch === '<' || (ch === '&' && command[i + 1] === '>')) {
      // A bare fd number directly before the operator (2>) belongs to the redirection, not the command.
      if (/^\d+$/.test(cur)) {
        cur = '';
        has = false;
      } else push();
      const op = ['&>>', '<<<', '>>', '>|', '&>', '>&', '<<'].find((o) => command.startsWith(o, i)) || ch;
      tokens.push(op);
      i += op.length - 1;
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
const WRAPPERS = ['sudo', 'command', 'env', 'exec', 'time', 'nohup'];

// Simple commands of a command line: [{ words, redirects: [{ op, target }] }].
export function segments(command) {
  const out = [];
  const tokens = tokenize(command);
  let words = [];
  let redirects = [];
  const flush = () => {
    if (words.length || redirects.length) out.push({ words, redirects });
    words = [];
    redirects = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (OPS.has(t)) flush();
    else if (REDIRECTS.has(t)) {
      redirects.push({ op: t, target: tokens[i + 1] ?? '' });
      i++;
    } else words.push(t);
  }
  flush();
  return out;
}

function commandStart(words) {
  let k = 0;
  while (k < words.length && (/^\w+=/.test(words[k]) || WRAPPERS.includes(words[k]))) k++;
  return k;
}

// Returns [{ dir, sub, args }] for every git invocation, and { cd } markers for directory changes.
export function gitInvocations(command) {
  const out = [];
  for (const { words } of segments(command)) {
    const k = commandStart(words);
    if (words[k] && /(^|[\\/])git(\.exe)?$/i.test(words[k])) {
      let dir = null;
      let j = k + 1;
      while (j < words.length && words[j].startsWith('-')) {
        if (words[j] === '-C') dir = words[j + 1] ?? null;
        j += GIT_OPTS_WITH_VALUE.has(words[j]) ? 2 : 1;
      }
      if (j < words.length) out.push({ dir, sub: words[j], args: words.slice(j + 1) });
    }
    if (words[0] === 'cd' && words[1]) out.push({ cd: words[1] });
  }
  return out;
}

const nonFlags = (args) => args.filter((a) => !a.startsWith('-'));

// Paths a command line would create, overwrite or delete: [{ path, how }] plus { cd } markers.
export function writeTargets(command) {
  const out = [];
  for (const { words, redirects } of segments(command)) {
    for (const r of redirects) {
      if (/^>|^&>/.test(r.op) && r.op !== '>&' && r.target && !/^&|^\/dev\/(null|stdout|stderr)$/.test(r.target)) {
        out.push({ path: r.target, how: `redirect ${r.op}` });
      }
    }
    if (words[0] === 'cd' && words[1]) {
      out.push({ cd: words[1] });
      continue;
    }
    const k = commandStart(words);
    const cmd = (words[k] || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
    const args = words.slice(k + 1);
    const add = (paths, how) => paths.forEach((p) => out.push({ path: p, how }));
    switch (cmd) {
      case 'tee':
        add(nonFlags(args), 'tee');
        break;
      case 'cp':
      case 'install':
      case 'ln': {
        const files = nonFlags(args);
        const t = args.indexOf('-t');
        if (t >= 0 && args[t + 1]) add([args[t + 1]], cmd);
        else if (files.length > 1) add([files[files.length - 1]], cmd);
        break;
      }
      case 'mv':
        add(nonFlags(args), 'mv');
        break;
      case 'rm':
      case 'unlink':
      case 'touch':
      case 'shred':
        add(nonFlags(args), cmd);
        break;
      case 'truncate':
        add(nonFlags(args.filter((a, i) => !['-s', '--size'].includes(args[i - 1]))), 'truncate');
        break;
      case 'sed':
      case 'perl':
        if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
          const files = nonFlags(args);
          if (files.length > 1) add(files.slice(1), `${cmd} -i`);
        }
        break;
      case 'dd':
        add(args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3)), 'dd');
        break;
      case 'git':
        if (['rm', 'mv'].includes(args[0])) add(nonFlags(args.slice(1)), `git ${args[0]}`);
        break;
      default:
        break;
    }
  }
  return out;
}
