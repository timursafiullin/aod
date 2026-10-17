// Path comparison that survives aliases: macOS /var -> /private/var, Windows 8.3 short names (RUNNER~1),
// drive-letter case. Paths that do not exist yet are resolved through their nearest existing ancestor.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const isWin = process.platform === 'win32';

export function canonical(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    rest.unshift(cur.slice(parent.length).replace(/^[\\/]/, ''));
    cur = parent;
  }
  let real = cur;
  try {
    real = realpathSync.native(cur);
  } catch {}
  return rest.length ? join(real, ...rest) : real;
}

const norm = (p) => {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return isWin || /^[A-Za-z]:\//.test(s) ? s.toLowerCase() : s;
};

// `child` relative to `base` with forward slashes, or null when it is not inside it. Works on strings, so
// Windows-style paths behave the same on every platform; existing paths are canonicalised first.
export function relativeInside(base, child, { real = true } = {}) {
  const b = real ? canonical(base) : base;
  const c = real ? canonical(child) : child;
  const nb = norm(b);
  const nc = norm(c);
  if (nc === nb) return '';
  if (!nc.startsWith(`${nb}/`)) return null;
  return c.replace(/\\/g, '/').slice(nb.length + 1);
}
