#!/usr/bin/env node
// AOD command-line entry. Deterministic mechanics live here; skills call it so judgment stays in prompts.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor, formatDoctor } from './lib/doctor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function version() {
  return JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

const USAGE = `aod <command> [options]

Commands:
  doctor [--json]   Check that node, git and (optionally) codex are ready
  --version         Print the plugin version
  help              Show this help`;

export function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case '--version':
    case '-v':
      console.log(version());
      return 0;
    case 'doctor': {
      const report = runDoctor();
      console.log(rest.includes('--json') ? JSON.stringify(report, null, 2) : formatDoctor(report));
      return report.ok ? 0 : 1;
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n\n${USAGE}`);
      return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
