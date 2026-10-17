# Review checklist

- [ ] The change does what the spec intends, not only what the tests check.
- [ ] Every changed path is inside the packet scope; contracts and acceptance tests untouched.
- [ ] No skipped, special-cased or loosened tests; no hardcoded expected values in production code.
- [ ] New unit tests would fail if the new code were removed or broken.
- [ ] Errors are handled at boundaries; no silent catch-all.
- [ ] Deterministic: no unseeded randomness, time or ordering dependence in tests.
- [ ] Names, comments and docs are clear; no dead code.
- [ ] Deviations and risks in the report are acceptable.

Severity: blocker (contract violation, incorrectness, out of scope, weakened tests), major (insufficient tests,
non-determinism, performance), minor (clarity, naming).
