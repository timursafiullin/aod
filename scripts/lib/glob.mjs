// Glob matching for scope rules: `**` crosses directories, `*` and `?` do not. Paths use forward slashes.

const cache = new Map();

export function globToRegExp(glob) {
  if (cache.has(glob)) return cache.get(glob);
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        const slashAfter = glob[i + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const compiled = new RegExp(`^${re}$`);
  cache.set(glob, compiled);
  return compiled;
}

export const normalizePath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

export function matchesAny(path, globs = []) {
  const p = normalizePath(path);
  return globs.some((g) => globToRegExp(normalizePath(g)).test(p));
}
