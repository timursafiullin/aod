# ADR-0008: Release process — semver tags, the changelog as release notes, a 1.0 release candidate

Status: Accepted
Date: 2026-10-17

## Context

M6 opens AOD to the community. Users install the plugin from this repository's marketplace manifest. Claude Code
reads the version from `.claude-plugin/plugin.json`. Until now, versions were bumped by hand per milestone, and
nothing guaranteed that `plugin.json`, `CHANGELOG.md` and git tags agree. M0–M5 are merged and covered by CI on
three operating systems. The roadmap's 1.0 exit criterion has two parts: an install on a fresh machine that
reaches a first delegated task in under 15 minutes, and feedback from 2–3 external users. Neither has happened
yet.

## Decision

1. **Semantic versioning** of the plugin, applied to its user-facing surface:
   - skill names;
   - `aod` commands, flags, JSON output fields and exit codes;
   - `aod.config.json` keys;
   - the ledger schema;
   - the `.agents/` layout.

   A breaking change to any of these needs a major version from 1.0 on, with a migration note in the changelog.
2. **One source for release notes:** each release is a `## X.Y.Z — title` section in `CHANGELOG.md`.
   Contributors add lines under `## Unreleased`. At release time a maintainer renames that heading to the new
   version and sets the same version in `plugin.json`.
3. **Tag-driven releases:** pushing `vX.Y.Z` (or `vX.Y.Z-rc.N`) runs `.github/workflows/release.yml`. The
   workflow:
   - runs `scripts/dev/release-notes.mjs` to check that the tag, `plugin.json` and the newest changelog entry
     agree;
   - runs the tests;
   - creates the GitHub release from that changelog section;
   - marks a tag with a pre-release suffix as a pre-release.
4. **CI drift check:** `tests/release.test.mjs` fails a PR in four cases:
   - `plugin.json` and the newest versioned changelog entry differ (a leading `Unreleased` entry is allowed);
   - a skill's `name` differs from its folder name;
   - a skill's description is missing or too long;
   - the README links to a file that does not exist.
5. **M6 ships `1.0.0-rc.1`.** `1.0.0` follows once the quick start has been run on a fresh machine and 2–3
   external users have tried the release candidate. The tagging and the repository's visibility (it is private
   today) are the product owner's decisions.

## Consequences

- A forgotten version bump or changelog entry fails CI, not a user's install.
- The marketplace manifest has no version of its own (`source: "./"`), so `plugin.json` stays the only version
  field.
- Publishing requires a public repository. Until then, only accounts with access can run
  `/plugin marketplace add timursafiullin/aod`.

## Alternatives considered

- Release tooling such as release-please or changesets: rejected. It would add dependencies and a bot for a
  one-file changelog, which conflicts with the zero-dependency rule (ADR-0001).
- Releasing 1.0.0 straight away: rejected. The roadmap's exit criterion includes external users, and an RC
  keeps the option of breaking fixes without a major bump.
