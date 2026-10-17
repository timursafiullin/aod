# Contributing to AOD

Thanks for helping. AOD is a Claude Code plugin with a zero-dependency Node.js CLI. Contributions of every size
are welcome: bug reports from real projects are the most valuable.

## Ground rules

- **No runtime dependencies.** The CLI uses Node.js built-ins only (ADR-0001), so users never run an install
  step. Dev-only tooling must not be needed to run the tests either.
- **Judgment in skills, mechanics in the CLI.** A skill (`skills/<name>/SKILL.md`) says *what to decide*; the CLI
  (`scripts/aod.mjs`) does *what can be checked*. If a rule can be checked deterministically, put it in the CLI or
  a hook, not in a prompt.
- **Red lines are hooks, not advice.** Anything that must never happen (force-push, editing contracts, writing
  outside a slot's scope) belongs in `scripts/hooks/` or the gates.
- **English** for code, docs, commit messages and issues.
- **Cross-platform.** Windows, macOS and Linux, Node 20 and 22. Mind path separators, `/private/var` aliases and
  8.3 short names (`scripts/lib/paths.mjs`).

## Development

```bash
git clone https://github.com/timursafiullin/aod && cd aod
node --test                        # all tests, including end-to-end runs with a fake Codex
node scripts/aod.mjs help          # the CLI
```

Try your change in Claude Code from a local checkout:

```text
/plugin marketplace add /path/to/aod
/plugin install aod@aod
```

After editing skills or hooks, run `claude plugin marketplace update aod` and start a new session.

The end-to-end tests drive the real CLI against `tests/fixtures/fake-codex.mjs`, which imitates `codex exec`
(scenarios: good, out-of-scope, skip, blocked, quota, crash). Add a scenario rather than calling real Codex in
tests.

## Pull requests

1. One topic per PR, branched from `master`.
2. Add or update tests; `node --test` must pass on all three operating systems (CI checks it).
3. User-visible change: add a line to the top entry of `CHANGELOG.md` (create an `## Unreleased` entry if there is
   none). Do not bump the version; maintainers do that at release time.
4. A change of behaviour or architecture: add an ADR in `.agents/decisions/` (copy `template.md`, next free
   number, add it to `index.md`).
5. Keep skills short. Each skill's `description` says when to use it; that text decides whether Claude loads it.

## Reporting bugs

Use the bug report form. Please include `node scripts/aod.mjs doctor --json` (or `/aod:doctor`), the failing
command with its JSON output, and, for delegation problems, `.agents/tasks/jobs/T-xxxx/stderr.log`. Remove
anything private first: briefs and reports contain your code.

## Releases (maintainers)

See ADR-0008. In short: move `Unreleased` to the new version in `CHANGELOG.md`, set the same version in
`.claude-plugin/plugin.json`, merge, then tag `vX.Y.Z` on `master` and push the tag. The release workflow checks
that the tag, `plugin.json` and the changelog agree, runs the tests and publishes the GitHub release.

## Code of conduct

Be kind, assume good intent, keep discussions about the work. Harassment of any kind is not tolerated;
maintainers may remove comments or contributors that break this.

By contributing you agree that your contribution is licensed under the [Apache-2.0](LICENSE) license.
