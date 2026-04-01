# STRATA — Repository Intelligence Platform
### BUILD SPECIFICATION v1.0

> **For autonomous agent execution.**
> All agents must read this document in full before writing any code.

---

## Table of Contents

1. [Project Overview](#section-01-project-overview)
2. [Architecture](#section-02-architecture)
3. [Module Specifications](#section-03-module-specifications)
4. [Data Pipeline & Report Schema](#section-04-data-pipeline--report-schema)
5. [Frontend Dashboard & Visualisations](#section-05-frontend-dashboard--visualisations)
6. [CLI Interface](#section-06-cli-interface)
7. [Complete File Structure](#section-07-complete-file-structure)
8. [Agent Directives & Autonomy Guidelines](#section-08-agent-directives--autonomy-guidelines)
9. [Quality & Testing](#section-09-quality--testing)
10. [Delivery Checklist](#section-10-delivery-checklist)

---

## SECTION 01 — Project Overview

### 1.1 What is Strata?

Strata is a fully local, language-agnostic repository intelligence platform. It ingests any Git repository, performs deep static analysis and historical mining, and renders a beautiful interactive web dashboard exposing insights that no existing tool provides in a unified way. Strata runs entirely on the developer's machine — no cloud, no GitHub API, no authentication. Point it at a repo, run one command, and a browser tab opens with everything.

### 1.2 The Problem This Solves

Existing tools are fragmented, CLI-only, and aesthetically poor. GitHub's native analytics are shallow. `cloc` counts lines. `git-quick-stats` gives a terminal wall of text. `code-maat` requires manual setup. Nobody has built the beautiful, deep, unified version. Strata is that version.

**Specific gaps Strata fills:**
- No tool shows hotspot maps (churn × complexity) with file-level drill-down
- No tool visualises bus factor risk as an interactive authorship graph
- No tool overlays function-level age across the entire codebase
- No tool renders commit coupling heatmaps in a browser
- No tool aggregates all of the above into a single installable CLI

### 1.3 Target Users

| User | Primary Use Case |
|------|-----------------|
| Solo developer | Portfolio showcase — "look what my codebase looks like" |
| Team lead | Identify risk hotspots before a sprint |
| Code reviewer | Understand historical context of a file before reviewing |
| Open-source maintainer | Bus factor, contributor spread, dead code |
| Tech lead / architect | Coupling graph, dependency evolution over time |

### 1.4 Core Principles

- **Zero cloud dependency** — all analysis runs locally using git CLI and Node.js
- **Language agnostic** — works on any repo regardless of programming language
- **Single command** — `strata analyse ./my-repo` is all a user ever needs to type
- **Incrementally cacheable** — results are cached in `.strata/` so repeat runs are instant
- **Extensible** — plugin architecture for custom analysers from day one
- **Beautiful by default** — the dashboard is the product, not an afterthought

### 1.5 What Strata Is NOT

- Not a linter — it does not enforce style or flag bugs
- Not a CI tool — it is for human understanding, not automated gates
- Not GitHub-dependent — it works on any git repo, local or remote clone
- Not a SaaS — there is no server, no account, no telemetry

---

## SECTION 02 — Architecture

### 2.1 High-Level Architecture

Strata is a monorepo with two primary packages: a CLI/backend engine (Node.js + TypeScript) and a frontend dashboard (React + TypeScript + D3). Communication between them happens via a static JSON bundle written to disk — the backend writes analysis results to `.strata/report.json` and then serves the frontend as a local HTTP server. This design means the frontend can also be opened as a static file (no server required once analysis is complete).

### Data Flow

| Step | Actor | Input | Output |
|------|-------|-------|--------|
| 1 | CLI | User command + repo path | Validated config object |
| 2 | Git Engine | Repo path + config | Raw git log / blame / diff data |
| 3 | Analysers (×6) | Raw git data + file tree | Structured metric objects |
| 4 | Aggregator | All metric objects | `.strata/report.json` (~5–50MB) |
| 5 | Server | report.json | HTTP endpoint serving JSON + static assets |
| 6 | Frontend | JSON via fetch | Interactive dashboard rendered in browser |

### 2.2 Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 20+ | LTS, native ESM, fast child_process for git |
| Language | TypeScript 5.x (strict) | Full type safety end to end |
| CLI framework | Commander.js | Lightweight, battle-tested |
| Git parsing | simple-git + raw child_process | Best of both — high-level and raw |
| Static analysis | tree-sitter (WASM) | Fast, language-agnostic AST parsing |
| Frontend framework | React 18 | Component model suits dashboard well |
| Visualisation | D3.js v7 | Maximum control over custom charts |
| Bundler | Vite 5 | Fast HMR during dev, optimal prod bundles |
| Styling | Tailwind CSS + CSS vars | Utility-first + design token theming |
| State management | Zustand | Simple, no boilerplate for this scale |
| Testing | Vitest + Playwright | Unit + E2E coverage |
| Cache format | JSON + msgpack optional | Lightweight, human-inspectable |

### 2.3 Monorepo Structure (Top Level)

```
strata/
  packages/
    core/          # Git engine, analysers, aggregator, types
    cli/           # Commander.js entry, config loading, server
    ui/            # React dashboard (Vite project)
  scripts/         # Dev utilities, release scripts
  tests/           # Integration tests (use fixture repos)
  fixtures/        # Small sample repos for deterministic testing
  .strata/         # Runtime output dir (gitignored in Strata itself)
  package.json     # Root workspace config
  turbo.json       # Turborepo pipeline
  tsconfig.base.json
```

### 2.4 Package Dependency Graph

`cli → core` (imports engine, types, analysers).  
`ui → none` (fetches JSON at runtime).  
`core → no internal deps` (only npm deps: simple-git, tree-sitter, fast-glob).

> ⚡ **Agents must keep this dependency direction strict. `ui` must never import from `core` or `cli` at build time.**

---

## SECTION 03 — Module Specifications

### 3.1 `packages/core/src/git/` — Git Engine

The Git Engine is the foundation. It wraps git CLI operations into typed, cacheable async functions. Every function checks `.strata/cache/` before executing git commands. Cache keys are hashed from `(repoPath + HEAD commit SHA + function name + args)`.

---

#### 3.1.1 `git/log.ts` — Commit History Extractor

Extracts full commit history with structured fields. Uses `--format` with custom separator to avoid delimiter collisions.

```typescript
interface Commit {
  sha: string           // full 40-char SHA
  shortSha: string      // 7-char
  author: string        // name
  email: string
  timestamp: number     // unix ms
  date: string          // ISO 8601
  message: string       // full message
  subject: string       // first line only
  filesChanged: string[]// paths touched
  insertions: number
  deletions: number
  isMerge: boolean
}

// Key function signatures
getCommitHistory(repoPath: string, options?: LogOptions): Promise<Commit[]>
getCommitsBetween(repoPath, fromSha, toSha): Promise<Commit[]>
getFirstCommit(repoPath): Promise<Commit>
getCommitsForFile(repoPath, filePath): Promise<Commit[]>
```

---

#### 3.1.2 `git/blame.ts` — Line-Level Authorship

Runs `git blame --porcelain` on each file. Parses output into per-line records. Expensive — always check cache first. Supports batch processing with configurable concurrency.

```typescript
interface BlameLine {
  lineNumber: number
  sha: string
  author: string
  email: string
  timestamp: number
  content: string
}

interface FileBlame {
  filePath: string
  lines: BlameLine[]
  uniqueAuthors: string[]
  lastModified: number
}

getFileBlame(repoPath, filePath): Promise<FileBlame>
getAllFilesBlame(repoPath, concurrency?: number): Promise<Map<string, FileBlame>>
```

---

#### 3.1.3 `git/diff.ts` — Change Analysis

```typescript
interface FileChurn {
  filePath: string
  totalCommits: number
  totalInsertions: number
  totalDeletions: number
  churnScore: number      // insertions + deletions
  changeFrequency: number // commits per week since creation
  firstSeen: number
  lastChanged: number
}

getFileChurn(repoPath): Promise<Map<string, FileChurn>>
getDiffForCommit(repoPath, sha): Promise<FileDiff[]>
getChurnOverTime(repoPath, granularity: 'day'|'week'|'month'): Promise<ChurnSeries[]>
```

---

#### 3.1.4 `git/coupling.ts` — Commit Co-change Coupling

Two files are "coupled" if they frequently appear in the same commit. This is a powerful proxy for hidden dependencies not expressed in imports. Uses a sliding window over commit history.

```typescript
interface FileCoupling {
  fileA: string
  fileB: string
  coChangeCount: number
  totalCommitsA: number
  totalCommitsB: number
  couplingStrength: number  // coChanges / min(totalA, totalB)
}

getCommitCoupling(repoPath, minCoChanges?: number): Promise<FileCoupling[]>
```

---

### 3.2 `packages/core/src/analysers/` — Six Analyser Modules

Each analyser takes raw git data + the file tree and produces a typed metric object. Analysers are stateless functions — easy to test, cache, and parallelise.

---

#### 3.2.1 `analysers/hotspot.ts` — Hotspot Analyser

Combines churn score with cyclomatic complexity to produce a hotspot score per file. Files that are both complex AND frequently changed are your highest-risk files. Complexity is computed via tree-sitter AST analysis (count decision points: `if`, `for`, `while`, `&&`, `||`, ternary).

```typescript
interface HotspotMetric {
  filePath: string
  language: string
  loc: number               // lines of code (non-blank, non-comment)
  complexity: number        // cyclomatic complexity
  churnScore: number
  hotspotScore: number      // normalised 0-100
  riskLevel: 'low'|'medium'|'high'|'critical'
  lastTouched: number
  touchCount: number
}

// Hotspot score formula:
// normalise both complexity and churn to 0-1 range across all files
// hotspotScore = (complexityNorm * 0.5 + churnNorm * 0.5) * 100
// riskLevel thresholds: critical >75, high >50, medium >25, low otherwise
```

---

#### 3.2.2 `analysers/busFactor.ts` — Bus Factor Analyser

For every file, calculates what percentage of lines each author "owns" (wrote and has not had overwritten). Bus factor per file = number of authors who collectively own >50% of lines. Bus factor per repo = weighted average across all files.

```typescript
interface BusFactorMetric {
  filePath: string
  busFactor: number         // 1 = single point of failure
  owners: AuthorOwnership[]
  orphanRisk: boolean       // true if primary owner has <1 commit in 90 days
}

interface AuthorOwnership {
  author: string
  email: string
  linesOwned: number
  percentOwned: number
  lastActive: number
}

interface RepoBusFactorSummary {
  repoWideScore: number
  criticalFiles: BusFactorMetric[]   // busFactor === 1
  contributorGraph: ContributorNode[]
}
```

---

#### 3.2.3 `analysers/age.ts` — Code Age Analyser

Assigns an age in days to every line of code using blame data. Aggregates per file and per directory. Identifies ancient stable code vs perpetually rewritten code.

```typescript
interface AgeMetric {
  filePath: string
  medianLineAgeDays: number
  oldestLineAgeDays: number
  newestLineAgeDays: number
  ageDistribution: AgeBucket[]  // histogram buckets: 0-7d, 7-30d, 30-90d, 90d+
  stableZones: LineRange[]      // contiguous blocks untouched for >180 days
}
```

---

#### 3.2.4 `analysers/coupling.ts` — Coupling Graph Builder

Transforms raw coupling data into a graph structure suitable for D3 force layout. Filters by minimum coupling threshold. Detects strongly-coupled clusters (potential hidden modules).

```typescript
interface CouplingGraph {
  nodes: CouplingNode[]
  edges: CouplingEdge[]
  clusters: string[][]   // groups of files that form tight coupling clusters
}

interface CouplingNode {
  id: string             // filePath
  degree: number         // number of coupled files
  betweenness: number    // graph centrality score
}

interface CouplingEdge {
  source: string
  target: string
  strength: number       // 0-1
  coChanges: number
}
```

---

#### 3.2.5 `analysers/loc.ts` — Lines of Code Analyser

Counts lines per file with language detection. Separates source, test, config, and docs. Tracks LOC over time by replaying history. Identifies dead files (exist in tree but no git activity in >365 days and never imported).

```typescript
interface LocMetric {
  filePath: string
  language: string
  category: 'source'|'test'|'config'|'docs'|'generated'|'unknown'
  totalLines: number
  codeLines: number       // non-blank, non-comment
  commentLines: number
  blankLines: number
  commentRatio: number    // commentLines / codeLines
}

interface LocSnapshot {
  date: string
  totalLoc: number
  byLanguage: Record<string, number>
  byCategory: Record<string, number>
}

getLocOverTime(repoPath, granularity): Promise<LocSnapshot[]>
```

---

#### 3.2.6 `analysers/authors.ts` — Author Intelligence Analyser

Aggregates all author activity. Normalises author identities (same person, different emails). Computes contribution velocity, specialisation score (does author only touch certain directories?), and activity heatmap data.

```typescript
interface AuthorMetric {
  canonicalName: string
  emails: string[]
  totalCommits: number
  totalInsertions: number
  totalDeletions: number
  firstCommit: number
  lastCommit: number
  activeDays: number
  primaryLanguages: string[]
  primaryDirectories: string[]
  specialisationScore: number   // 0=generalist, 1=specialist
  commitHeatmap: HeatmapCell[]  // for GitHub-style activity grid
  peakHour: number              // hour-of-day with most commits
  peakDayOfWeek: number
}
```

---

## SECTION 04 — Data Pipeline & Report Schema

### 4.1 Aggregator — `packages/core/src/aggregator.ts`

The aggregator orchestrates all analysers, runs them in parallel where possible, merges results, and writes the final `report.json`. It also handles incremental updates — if the HEAD commit matches the cached SHA, it skips re-analysis entirely.

### Execution Order & Parallelism

| Phase | Modules | Dependency |
|-------|---------|------------|
| Phase 1 (parallel) | git/log.ts, git/diff.ts | No dependencies |
| Phase 2 (parallel) | git/blame.ts, git/coupling.ts | Requires Phase 1 complete |
| Phase 3 (parallel) | All 6 analysers | Requires Phase 1+2 |
| Phase 4 (serial) | Aggregator merge + write | Requires Phase 3 |

### 4.2 `report.json` Schema

The report is the contract between backend and frontend. It must never have breaking changes without a schema version bump.

```typescript
interface StrataReport {
  meta: {
    strataVersion: string
    schemaVersion: number      // bump on breaking changes
    generatedAt: number        // unix ms
    repoPath: string
    repoName: string
    headSha: string
    headDate: string
    totalCommits: number
    totalFiles: number
    totalAuthors: number
    analysisDurationMs: number
  }
  summary: RepoDashboardSummary  // KPI cards data
  hotspots: HotspotMetric[]
  busFactor: RepoBusFactorSummary
  age: AgeMetric[]
  coupling: CouplingGraph
  loc: {
    current: LocMetric[]
    history: LocSnapshot[]
  }
  authors: AuthorMetric[]
  commits: Commit[]            // full history, used by timeline viz
  fileTree: FileTreeNode[]     // directory tree with metric overlays
}
```

### 4.3 Cache Strategy

Cache lives in `.strata/cache/` as gzipped JSON files. Key = `sha256(repoPath + headSha + analyserName)`. On any strata run: compute key, check for file, deserialise if hit, run analyser + write if miss.

Partial cache invalidation: if only the hotspot analyser params changed (e.g. threshold), only hotspot is re-run; git log and blame caches remain valid.

### 4.4 File Tree Builder

Builds a hierarchical `FileTreeNode` tree from the flat list of tracked files. Each node carries merged metrics from all analysers — making it possible for the frontend to render any metric as a treemap overlay with zero additional computation.

---

## SECTION 05 — Frontend Dashboard & Visualisations

### 5.1 Dashboard Layout

The dashboard is a single-page React app. Left sidebar for navigation. Main content area for visualisations. Collapsible details panel on the right for file-level drill-down. The top bar shows the repo name, HEAD SHA, generation date, and a global search box.

### Page / View Structure

| Route | Content |
|-------|---------|
| `/` (Overview) | KPI cards, activity heatmap, language pie, top hotspots preview |
| `/hotspots` | Bubble chart (complexity vs churn), file list with risk badges, treemap overlay |
| `/bus-factor` | D3 force authorship graph, per-file ownership bars, orphan risk list |
| `/age` | Treemap coloured by median age, age histogram, stable zone heatmap |
| `/coupling` | D3 force-directed coupling graph, cluster detection callouts, edge weight filter |
| `/loc` | LOC over time area chart, language breakdown stacked bar, dead file list |
| `/authors` | Author cards, contribution timeline, specialisation radar, commit heatmap |
| `/commits` | Timeline scrubber, commit list with search/filter, per-commit diff summary |
| `/explorer` | File tree browser with metric overlay selector (any metric as colour) |

### 5.2 Visualisation Specifications

#### 5.2.1 Hotspot Bubble Chart (D3)
X-axis = churn score, Y-axis = cyclomatic complexity. Bubble size = LOC. Bubble colour = risk level (green→red). Zoom + pan. Click bubble → opens file details panel. Quadrant labels: top-right = "Danger Zone", top-left = "Complex but Stable", bottom-right = "Active but Simple", bottom-left = "Low Risk". Quadrant lines are draggable to adjust thresholds.

#### 5.2.2 Coupling Force Graph (D3)
Force-directed graph. Nodes = files, sized by degree. Edges = coupling strength (width + opacity). Colour nodes by directory. Minimum coupling threshold slider (filters weak edges). Click node → highlight neighbourhood. Detected clusters are outlined with a convex hull. Drag nodes to reposition.

#### 5.2.3 Age Treemap (D3)
Treemap layout. Each rectangle = a file, area = LOC. Colour = median line age (cool blue = new, warm red = ancient). Hover = tooltip with exact stats. Click = drill into directory. Breadcrumb trail for navigation. Toggle between different metric overlays (age, churn, complexity, bus factor).

#### 5.2.4 LOC Over Time (D3 Area Chart)
Stacked area chart. X = time, Y = total LOC. Each layer = a language. Hover shows exact counts per language at that point in time. Brush/zoom for time range selection. Annotations for major milestones (first commit, most active week, etc.).

#### 5.2.5 Author Activity Heatmap
GitHub contribution graph style. 52 weeks × 7 days. Colour intensity = commit count. Hover = date + count. Click week → filters commit list to that week. Can be toggled per-author for comparison.

#### 5.2.6 Authorship Sunburst (D3)
Sunburst chart. Inner ring = top-level directories. Outer ring = files. Sector angle = LOC. Colour = primary author (from bus factor data). Shows instantly who owns what at a directory level.

### 5.3 Component Architecture (React)

```
ui/src/
  App.tsx                    # Router + layout shell
  store/
    reportStore.ts           # Zustand store, loads + holds report.json
    uiStore.ts               # UI state: selected file, filters, etc.
  components/
    layout/
      Sidebar.tsx
      TopBar.tsx
      DetailPanel.tsx
    charts/
      HotspotBubble.tsx
      CouplingGraph.tsx
      AgeTreemap.tsx
      LocTimeline.tsx
      AuthorHeatmap.tsx
      AuthorshipSunburst.tsx
    shared/
      KPICard.tsx
      RiskBadge.tsx
      FileList.tsx
      SearchBox.tsx
      Tooltip.tsx
      Breadcrumb.tsx
      ThresholdSlider.tsx
  pages/
    Overview.tsx
    Hotspots.tsx
    BusFactor.tsx
    Age.tsx
    Coupling.tsx
    Loc.tsx
    Authors.tsx
    Commits.tsx
    Explorer.tsx
  hooks/
    useReport.ts             # Typed selectors from store
    useD3.ts                 # D3 integration helper
    useFilter.ts             # Generic filter/sort hook
  utils/
    formatters.ts            # Numbers, dates, file sizes
    colours.ts               # Risk colours, language colours, scales
    treeUtils.ts             # File tree helpers
```

### 5.4 Design System

- **Background:** `#0D0D0D`
- **Surface:** `#111111`
- **Border:** `#1E1E1E`
- **Accent primary:** `#00FF88` (green)
- **Accent secondary:** `#00C8FF` (blue)
- **Warning:** `#FFB800`
- **Danger:** `#FF4444`
- **Font:** Inter (sans) + JetBrains Mono (code)

All chart colours defined in a central `colours.ts` file — never hardcoded in components.

---

## SECTION 06 — CLI Interface

### 6.1 Command Structure

```bash
# Primary command
strata analyse <repo-path> [options]

# Options
  --out <dir>           Output dir (default: <repo>/.strata)
  --no-browser          Don't open browser after analysis
  --no-cache            Force full re-analysis
  --port <n>            Dashboard server port (default: 4321)
  --since <date>        Only analyse commits after this date
  --ignore <glob>       Glob patterns to exclude (repeatable)
  --concurrency <n>     Parallel git operations (default: 4)
  --min-coupling <n>    Min co-changes to show in coupling (default: 3)
  --format <fmt>        Output format: dashboard|json|csv (default: dashboard)
  --watch               Re-analyse on new commits (polling)

# Other commands
strata serve <report-dir>   # Serve existing report without re-analysing
strata clean <repo-path>    # Delete .strata cache
strata diff <sha1> <sha2>   # Show metric diff between two commits
strata export <format>      # Export report as CSV or JSON
```

### 6.2 CLI UX Requirements

- Progress bar with phase labels (`Extracting history...`, `Analysing hotspots...`, `Rendering...`)
- Elapsed time per phase shown in dim text
- Final summary table printed to terminal after analysis
- Graceful error messages with actionable suggestions (e.g. if not a git repo)
- Colour output using `picocolors` (no chalk, too heavy)
- Spinners using `nanospinner`
- Check for Node.js version >= 20 on startup and warn if older

### 6.3 Config File Support

Strata reads `.stratarc.json` from repo root if present. All CLI flags can be set there. CLI flags override config file. Config file is optional — Strata works with zero config.

```json
{
  "ignore": ["dist/**", "node_modules/**", "*.min.js"],
  "since": "2023-01-01",
  "minCoupling": 5,
  "concurrency": 8
}
```

---

## SECTION 07 — Complete File Structure

### `packages/core/`

```
packages/core/
  src/
    git/
      log.ts            # Commit history extraction
      blame.ts          # Line-level authorship
      diff.ts           # Churn and change stats
      coupling.ts       # Co-change detection
      index.ts          # Re-exports
    analysers/
      hotspot.ts        # Complexity × churn
      busFactor.ts      # Authorship + orphan risk
      age.ts            # Line age via blame
      coupling.ts       # Graph builder
      loc.ts            # Line counting + history
      authors.ts        # Author intelligence
      index.ts
    static/
      treeSitter.ts     # tree-sitter WASM wrapper
      languageDetect.ts # Extension → language map
      complexity.ts     # Cyclomatic complexity via AST
      locCounter.ts     # Comment/blank stripping
    aggregator.ts       # Orchestrator
    fileTree.ts         # Tree builder with metric overlay
    cache.ts            # Read/write cache with gzip
    config.ts           # Config loading + defaults
    types.ts            # All shared TypeScript interfaces
    utils.ts            # Path helpers, formatters
    index.ts            # Public API of core package
  package.json
  tsconfig.json
```

### `packages/cli/`

```
packages/cli/
  src/
    index.ts            # Entry point, Commander setup
    commands/
      analyse.ts        # Main analyse command handler
      serve.ts          # Serve existing report
      clean.ts          # Cache cleanup
      diff.ts           # Metric diff between commits
      export.ts         # CSV/JSON export
    server.ts           # Express-lite static file server
    progress.ts         # Progress bar + spinners
    output.ts           # Terminal summary table
    installer.ts        # Copy UI build into CLI package
  package.json
  tsconfig.json
```

### `packages/ui/`

```
packages/ui/
  src/                  # (see Section 5.3 for full breakdown)
  public/
    index.html
  vite.config.ts
  tailwind.config.ts
  postcss.config.ts
  package.json
  tsconfig.json
```

---

## SECTION 08 — Agent Directives & Autonomy Guidelines

> 🤖 **ALL AGENTS: Read this section in its entirety before writing a single line of code.**

### 8.1 Core Mandate

You are building Strata as described in this document. This spec is your primary source of truth — but it is not a cage. It is a blueprint with intentional freedom baked in. Your job is to deliver working, high-quality software, not to slavishly copy-paste a spec. Use your judgment. Improve things. Surprise us.

### 8.2 What You MUST Follow

- TypeScript strict mode everywhere — no `any`, no unchecked casts
- The data flow direction: `git → analysers → aggregator → report.json → UI`
- The `report.json` schema — this is the frontend/backend contract
- The package dependency rules: `cli → core`, `ui → nothing at build time`
- The CLI command structure (Section 6.1) — exact flag names
- Dark theme design system (Section 5.4) — colour tokens are not negotiable
- Cache-first strategy for all git operations (Section 4.3)
- All 6 analysers must exist and produce their defined output types

### 8.3 Where You Have Full Autonomy

> ✅ **If you see a better implementation than what's described — use it. Document your decision in a code comment.**

- Internal implementation of any function — the interface matters, not the internals
- Choosing npm packages for tasks not specified
- Adding helper utilities, constants, or types you find useful
- Splitting any module into smaller files if it gets large
- Performance optimisations — streaming, lazy loading, worker threads
- Error handling strategies — be creative, be thorough
- Animation and microinteraction details in the UI
- Adding additional computed fields to any metric type if they add value
- Adjusting the formula for hotspot scoring if you have a better one

### 8.4 If You Think of a New Feature

> 💡 **Build it. As long as it doesn't break existing spec and doesn't bloat the codebase beyond ~10k lines total.**

Good candidates for bonus features:
- Commit message quality scoring (conventional commits compliance, avg length, etc.)
- PR/branch analysis if GitHub remote is detected
- Dependency graph from import statements (cross-reference with coupling graph)
- Test coverage awareness — mark files with no test counterpart
- "Time machine" mode — replay the repo's evolution as an animation
- Natural language summary of the repo generated via Claude API (optional, behind a flag)
- Dark/light mode toggle in the dashboard
- Permalink sharing — export a self-contained HTML file with all data embedded

If you add a feature, add it properly: types, tests, UI, and document it in `ADDITIONS.md` in the root.

### 8.5 Code Quality Standards

- Every exported function must have a JSDoc comment with `@param` and `@returns`
- Every TypeScript interface must have inline comments on non-obvious fields
- No function longer than 80 lines — extract helpers aggressively
- No file longer than 400 lines — split if approaching limit
- All async functions use try/catch with typed error handling
- No `console.log` in library code — use a passed logger or throw typed errors
- All D3 chart components must be responsive (use `ResizeObserver`)
- All charts must handle empty/null data gracefully (show an empty state UI)

### 8.6 Agent Coordination Rules (If Running as a Swarm)

| Agent | Owns | Responsibility |
|-------|------|----------------|
| Agent A | `packages/core/src/git/` | All git extraction modules |
| Agent B | `packages/core/src/analysers/` | All 6 analysers + static analysis |
| Agent C | `packages/core/src/aggregator.ts` + cache + types | Orchestration + schema |
| Agent D | `packages/cli/` | Full CLI package |
| Agent E | `packages/ui/src/components/charts/` | All D3 visualisations |
| Agent F | `packages/ui/src/pages/` + layout + store | Pages, routing, state |

- `types.ts` is Agent C's file — all agents PR changes to `types.ts` through Agent C
- Agents must not modify files outside their assigned area without flagging it
- Integration point: `report.json` schema must be agreed before Agents E/F start
- Agent D cannot start until Agent C has `types.ts` and `aggregator.ts` stable
- Agents E/F can use mock `report.json` data (see `fixtures/`) during development

### 8.7 Resolving Spec Ambiguity

If this spec is ambiguous on something, apply this decision hierarchy in order:

1. Pick the option that makes the user-facing experience better
2. Pick the option that keeps the codebase smaller and simpler
3. Pick the option that is easier to test
4. Pick whatever you think is right and leave a `// TODO:` comment explaining why

---

## SECTION 09 — Quality & Testing

### 9.1 Testing Strategy

| Type | Tool | Scope | Location |
|------|------|-------|----------|
| Unit tests | Vitest | Each analyser, each git module, all utils | `packages/core/src/**/*.test.ts` |
| Integration tests | Vitest | Full pipeline on fixture repos | `tests/integration/*.test.ts` |
| E2E tests | Playwright | Dashboard UI in a real browser | `tests/e2e/*.spec.ts` |
| Type tests | tsd | Verify public types are correct | `tests/types/*.test-d.ts` |

### 9.2 Fixture Repos

The `tests/fixtures/` directory contains three small git repos for deterministic testing:

- `fixtures/simple/` — 10 commits, 3 files, 1 author — baseline sanity checks
- `fixtures/team/` — 50 commits, 20 files, 4 authors — bus factor + coupling tests
- `fixtures/large/` — 200 commits, 100 files, 8 authors — performance + hotspot tests

These repos are committed as bare git repos and initialised by a setup script.

### 9.3 Critical Test Cases (Must Pass)

- `getCommitHistory` returns commits in reverse chronological order
- `getFileBlame` returns correct line counts matching `wc -l`
- `HotspotAnalyser` produces `hotspotScore` in range `[0, 100]` for all files
- `BusFactorAnalyser`: a single-author file has `busFactor === 1`
- `CouplingAnalyser`: `couplingStrength` is always in range `[0, 1]`
- `AgeAnalyser`: `newestLineAgeDays <= medianLineAgeDays <= oldestLineAgeDays`
- `LocAnalyser`: `codeLines + commentLines + blankLines === totalLines`
- Aggregator: `report.json` validates against schema on all fixture repos
- Cache: second run is >10x faster than first run on large fixture
- CLI: `strata analyse fixtures/simple` exits `0` and opens no browser in CI mode
- UI: all 9 pages render without errors on the large fixture report
- UI: all D3 charts render with correct number of elements vs data length

### 9.4 Performance Targets

| Scenario | Cold Run Target | Warm Run Target |
|----------|----------------|-----------------|
| 1,000 commit repo | < 10s | < 1s (cached) |
| 5,000 commit repo | < 45s | < 2s (cached) |
| 10,000 commit repo | < 120s | < 3s (cached) |
| Dashboard initial load | < 500ms | N/A |
| D3 chart render (large dataset) | < 100ms | N/A |

---

## SECTION 10 — Delivery Checklist

### 10.1 Core Feature Checklist

- [ ] `git/log.ts` — full commit history with all fields populated
- [ ] `git/blame.ts` — per-file, all-files, with concurrency control
- [ ] `git/diff.ts` — churn stats + over-time series
- [ ] `git/coupling.ts` — co-change detection with configurable min threshold
- [ ] `analysers/hotspot.ts` — complexity × churn with risk classification
- [ ] `analysers/busFactor.ts` — line ownership + orphan risk
- [ ] `analysers/age.ts` — line age distribution + stable zone detection
- [ ] `analysers/coupling.ts` — graph builder with cluster detection
- [ ] `analysers/loc.ts` — LOC per file + history snapshots
- [ ] `analysers/authors.ts` — full author intelligence with heatmap data
- [ ] `aggregator.ts` — parallel execution + cache + report.json write
- [ ] `fileTree.ts` — tree with metric overlays on all nodes
- [ ] `cache.ts` — gzip read/write with key hashing
- [ ] CLI `analyse` command — all flags working
- [ ] CLI `serve` command — serves existing report
- [ ] CLI `clean` command — removes cache
- [ ] CLI progress UI — phases, spinners, summary table
- [ ] Dashboard Overview page — KPI cards + heatmap + preview charts
- [ ] Dashboard Hotspots page — bubble chart + file list
- [ ] Dashboard Bus Factor page — force graph + ownership bars
- [ ] Dashboard Age page — treemap + histogram
- [ ] Dashboard Coupling page — force graph + cluster callouts
- [ ] Dashboard LOC page — area chart + language breakdown
- [ ] Dashboard Authors page — cards + heatmap + radar
- [ ] Dashboard Commits page — timeline + search
- [ ] Dashboard Explorer page — file tree + metric overlay selector
- [ ] All D3 charts responsive (`ResizeObserver`)
- [ ] All D3 charts handle empty data gracefully
- [ ] Global search across files and authors
- [ ] Detail panel on file click in any view
- [ ] Dark theme design system applied consistently
- [ ] TypeScript strict mode — zero errors
- [ ] All critical test cases passing (Section 9.3)
- [ ] Performance targets met (Section 9.4)
- [ ] `README.md` with install + usage instructions
- [ ] `ADDITIONS.md` documenting any agent-added features

### 10.2 Root `package.json` Scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "clean": "turbo clean",
    "strata": "node packages/cli/dist/index.js"
  }
}
```

### 10.3 Install Flow (must work end-to-end)

```bash
git clone https://github.com/your-handle/strata
cd strata
npm install
npm run build
npm run strata analyse /path/to/any/git/repo
# Browser opens at http://localhost:4321 showing the dashboard
```

### 10.4 Final Words to Agents

This is a portfolio centrepiece — it needs to be excellent, not just functional. The code quality, the visualisation polish, the CLI experience, the error messages, the loading states, the empty states — all of it matters. Build it like you're proud of it. Make decisions you'd defend in a code review. Leave the codebase in a state you'd be happy to open-source.

> 🎯 **Ship something that makes a senior engineer say: "Damn, this person knows what they're doing."**

---

*END OF SPECIFICATION — STRATA v1.0*

*Build something extraordinary.*
