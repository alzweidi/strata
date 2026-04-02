# Additions

These implementation details go beyond the baseline spec without changing the core product shape.

## Added

- In-flight git log snapshot deduplication: concurrent history consumers reuse the same cached snapshot load instead of replaying identical Git work.
- Automatic server port fallback: when the requested dashboard port is busy, the local server probes a small nearby range before failing.
- UI fixture fallback: the dashboard loads `fixtures/report.json` automatically in local development when no live `report.json` endpoint exists.
- Remote repository ingestion: `strata analyse` now accepts GitHub URLs directly and clones them into a temporary working directory before analysis.
- Broader history mode: `--all-refs` allows history-driven metrics to include all reachable refs instead of only the checked-out `HEAD` lineage.
- Correct per-file churn accounting: file touch stats now use per-file insertions and deletions instead of duplicating whole-commit totals across every changed file.
- Robust commit parsing in the live CLI path: report generation now preserves the full `git log` stream instead of collapsing to the first parsed commit.

## Notes

- These additions keep analysis Git-native and local in execution, even when the source repository is fetched from GitHub first.
- None of them change the `report.json` schema contract.
