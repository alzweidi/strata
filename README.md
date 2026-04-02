# Strata

Strata is a fully local repository intelligence platform. Point it at any Git repository and it builds a report with hotspot, bus factor, age, coupling, LOC, author, commit, and explorer views, then serves a local dashboard.

## Workspace

This repository is organized as a small monorepo:

- `packages/core`: Git mining, analysers, cache, report aggregation, and shared types.
- `packages/cli`: Commander-based CLI, local server, progress output, and report export helpers.
- `packages/ui`: Vite + React dashboard with D3 visualizations.
- `fixtures`: Mock report and deterministic data for local UI and test flows.
- `tests`: Integration, E2E, and type-level verification.

## Requirements

- Node.js 20+
- npm 10+
- Git installed and available on `PATH`

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Analyse a Repository

```bash
npm run strata -- analyse /path/to/any/git/repo
```

That command:

1. Mines Git history and blame data.
2. Runs the analyser pipeline.
3. Writes `.strata/report.json` into the target repository.
4. Starts a local dashboard server.
5. Opens the browser unless `--no-browser` is set.

## Common Commands

```bash
# Main workflow
npm run strata -- analyse ./some-repo

# Serve an existing report
npm run strata -- serve ./some-repo/.strata

# Remove generated output
npm run strata -- clean ./some-repo

# Compare two revisions
npm run strata -- diff <sha1> <sha2>

# Export the current report
npm run strata -- export csv
```

## Analyse Options

```bash
strata analyse <repo-path> [options]

  --out <dir>           Output dir (default: .strata)
  --no-browser          Don't open browser after analysis
  --no-cache            Force full re-analysis
  --port <n>            Dashboard server port (default: 4321)
  --since <date>        Only analyse commits after this date
  --ignore <glob>       Glob patterns to exclude (repeatable)
  --concurrency <n>     Parallel git operations (default: 4)
  --min-coupling <n>    Min co-changes to show in coupling (default: 3)
  --format <fmt>        dashboard|json|csv
  --watch               Re-analyse on new commits
```

## Config File

Strata reads an optional `.stratarc.json` from the analysed repository root.

```json
{
  "ignore": ["dist/**", "node_modules/**", "*.min.js"],
  "since": "2024-01-01",
  "minCoupling": 5,
  "concurrency": 8
}
```

CLI flags override config-file values.

## Development

```bash
# Run package dev tasks
npm run dev

# Typecheck all packages
npm run typecheck

# Run tests
npm run test
```

The UI falls back to `fixtures/report.json` during local development when `/report.json` is not available.

