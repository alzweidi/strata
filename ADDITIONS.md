# Additions

These implementation details go beyond the baseline spec without changing the core product shape.

## Added

- In-flight git log snapshot deduplication: concurrent history consumers reuse the same cached snapshot load instead of replaying identical Git work.
- Automatic server port fallback: when the requested dashboard port is busy, the local server probes a small nearby range before failing.
- UI fixture fallback: the dashboard loads `fixtures/report.json` automatically in local development when no live `report.json` endpoint exists.

## Notes

- These additions stay within the local-only, zero-cloud design of Strata.
- None of them change the `report.json` schema contract.
