# Invariants

Rules that hold for every change. Each line must be checkable.

- Interfaces are defined by contracts (schemas, API definitions; see the repository map in AGENTS.md) before
  they are implemented, and the contracts are their single source of truth.
- Acceptance tests are written before implementation and are never weakened to pass.
