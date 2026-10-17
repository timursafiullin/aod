# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting
(*Security* tab -> *Report a vulnerability*) on this repository. You will get an answer within 7 days.

In scope: anything that lets an implementer, a crafted repository or a task packet get past AOD's guardrails,
for example:

- writing outside a slot or a packet's scope without being flagged by the gates;
- editing protected paths (contracts, acceptance tests, accepted ADRs) despite the contract guard;
- destructive git commands slipping past the Bash guard;
- shell injection through packet fields, task titles or config values passed to `aod` commands.

Out of scope: the behaviour of Claude Code, Codex CLI or the models themselves, and commands a user runs with
the guards switched off (`guards` in `aod.config.json`).

AOD runs the commands your packets and config define (acceptance, baseline, mutation). Treat `.agents/` in a
repository you did not write like any other build script before running AOD in it.
