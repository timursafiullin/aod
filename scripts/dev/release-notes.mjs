#!/usr/bin/env node
// Release helper (ADR-0008): `node scripts/dev/release-notes.mjs v1.2.3` checks that the tag, plugin.json and the
// top CHANGELOG entry agree, then prints that version's CHANGELOG section as the GitHub release notes.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

// Sections start with "## <version>" (optionally followed by " — title").
export function changelogSections(text) {
  const out = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^## (\S+)(?:\s+[—-]\s+(.*))?$/.exec(line);
    if (m) {
      current = { version: m[1], title: m[2] || '', body: [] };
      out.push(current);
    } else if (current) current.body.push(line);
  }
  return out.map((s) => ({ ...s, body: s.body.join('\n').trim() }));
}

// allowUnreleased: CI between releases tolerates a leading "## Unreleased" entry; the release itself does not.
export function releaseCheck({ tag, pluginVersion, changelog, allowUnreleased = false }) {
  const errors = [];
  const version = String(tag || '').replace(/^v/, '');
  if (!SEMVER.test(version)) errors.push(`tag "${tag}" is not v<semver>`);
  if (pluginVersion !== version) errors.push(`.claude-plugin/plugin.json has version ${pluginVersion}, tag says ${version}`);
  const all = changelogSections(changelog);
  const sections = allowUnreleased && all[0]?.version === 'Unreleased' ? all.slice(1) : all;
  if (!sections.length) errors.push('CHANGELOG.md has no "## <version>" sections');
  else if (sections[0].version !== version) errors.push(`the newest CHANGELOG entry is ${sections[0].version}, tag says ${version}`);
  const section = sections.find((s) => s.version === version);
  if (section && !section.body) errors.push(`CHANGELOG entry ${version} is empty`);
  return {
    ok: errors.length === 0, errors, version, prerelease: version.includes('-'),
    title: section ? `v${version}${section.title ? ` — ${section.title}` : ''}` : null,
    notes: section?.body || null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const tag = process.argv[2];
  const result = releaseCheck({
    tag,
    pluginVersion: JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version,
    changelog: readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'),
  });
  if (!result.ok) {
    console.error(`release check failed:\n  ${result.errors.join('\n  ')}`);
    process.exit(1);
  }
  if (process.argv.includes('--title')) console.log(result.title);
  else console.log(result.notes);
}
