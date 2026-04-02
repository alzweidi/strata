export type DashboardFormat = "dashboard" | "json" | "csv";
export type Granularity = "day" | "week" | "month";
export type FileCategory =
  | "source"
  | "test"
  | "config"
  | "docs"
  | "generated"
  | "unknown";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type MetricOverlayName =
  | "age"
  | "busFactor"
  | "churn"
  | "complexity"
  | "hotspot"
  | "loc";

export interface LogOptions {
  since?: string;
  maxCount?: number;
  filePath?: string;
  allRefs?: boolean;
}

export interface FileChangeStat {
  filePath: string;
  insertions: number;
  deletions: number;
}

export interface Commit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  timestamp: number;
  date: string;
  message: string;
  subject: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
  fileStats?: FileChangeStat[];
  isMerge: boolean;
}

export interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  email: string;
  timestamp: number;
  content: string;
}

export interface FileBlame {
  filePath: string;
  lines: BlameLine[];
  uniqueAuthors: string[];
  lastModified: number;
}

export interface FileDiff {
  filePath: string;
  additions: number;
  deletions: number;
  previousPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface FileChurn {
  filePath: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  churnScore: number;
  changeFrequency: number;
  firstSeen: number;
  lastChanged: number;
}

export interface ChurnSeries {
  period: string;
  totalInsertions: number;
  totalDeletions: number;
  churnScore: number;
  fileCount: number;
}

export interface FileCoupling {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  totalCommitsA: number;
  totalCommitsB: number;
  couplingStrength: number;
}

export interface ComplexityMetric {
  decisionPoints: number;
  complexity: number;
  functions: number;
}

export interface HotspotMetric {
  filePath: string;
  language: string;
  loc: number;
  complexity: number;
  churnScore: number;
  hotspotScore: number;
  riskLevel: RiskLevel;
  lastTouched: number;
  touchCount: number;
}

export interface AuthorOwnership {
  author: string;
  email: string;
  linesOwned: number;
  percentOwned: number;
  lastActive: number;
}

export interface ContributorNode {
  id: string;
  label: string;
  type: "author" | "file";
  weight: number;
  group?: string;
}

export interface ContributorEdge {
  source: string;
  target: string;
  weight: number;
}

export interface ContributorGraph {
  nodes: ContributorNode[];
  edges: ContributorEdge[];
}

export interface BusFactorMetric {
  filePath: string;
  busFactor: number;
  owners: AuthorOwnership[];
  orphanRisk: boolean;
}

export interface RepoBusFactorSummary {
  repoWideScore: number;
  criticalFiles: BusFactorMetric[];
  contributorGraph: ContributorGraph;
}

export interface AgeBucket {
  label: string;
  minDays: number;
  maxDays?: number;
  lineCount: number;
}

export interface LineRange {
  startLine: number;
  endLine: number;
  ageDays: number;
}

export interface AgeMetric {
  filePath: string;
  medianLineAgeDays: number;
  oldestLineAgeDays: number;
  newestLineAgeDays: number;
  ageDistribution: AgeBucket[];
  stableZones: LineRange[];
}

export interface CouplingNode {
  id: string;
  degree: number;
  betweenness: number;
  directory: string;
}

export interface CouplingEdge {
  source: string;
  target: string;
  strength: number;
  coChanges: number;
}

export interface CouplingGraph {
  nodes: CouplingNode[];
  edges: CouplingEdge[];
  clusters: string[][];
}

export interface LocMetric {
  filePath: string;
  language: string;
  category: FileCategory;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  commentRatio: number;
}

export interface LocSnapshot {
  date: string;
  totalLoc: number;
  byLanguage: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface HeatmapCell {
  date: string;
  count: number;
  week: number;
  day: number;
}

export interface AuthorMetric {
  canonicalName: string;
  emails: string[];
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  firstCommit: number;
  lastCommit: number;
  activeDays: number;
  primaryLanguages: string[];
  primaryDirectories: string[];
  specialisationScore: number;
  commitHeatmap: HeatmapCell[];
  peakHour: number;
  peakDayOfWeek: number;
}

export interface FileTreeOverlay {
  churnScore?: number;
  hotspotScore?: number;
  complexity?: number;
  busFactor?: number;
  medianAgeDays?: number;
  loc?: number;
  primaryAuthor?: string;
  riskLevel?: RiskLevel;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  depth: number;
  children: FileTreeNode[];
  overlays: FileTreeOverlay;
  aggregateLoc: number;
}

export interface SummaryKpi {
  id: string;
  label: string;
  value: number | string;
  change?: number;
  tone?: "neutral" | "accent" | "warning" | "danger";
}

export interface RepoDashboardSummary {
  kpis: SummaryKpi[];
  topHotspots: HotspotMetric[];
  topRisks: BusFactorMetric[];
  languageBreakdown: Record<string, number>;
  activityHeatmap: HeatmapCell[];
  churnTrend: ChurnSeries[];
}

export interface ReportMeta {
  strataVersion: string;
  schemaVersion: number;
  generatedAt: number;
  repoPath: string;
  repoName: string;
  headSha: string;
  headDate: string;
  totalCommits: number;
  totalFiles: number;
  totalAuthors: number;
  analysisDurationMs: number;
}

export interface StrataReport {
  meta: ReportMeta;
  summary: RepoDashboardSummary;
  hotspots: HotspotMetric[];
  busFactor: RepoBusFactorSummary;
  age: AgeMetric[];
  coupling: CouplingGraph;
  loc: {
    current: LocMetric[];
    history: LocSnapshot[];
  };
  authors: AuthorMetric[];
  commits: Commit[];
  fileTree: FileTreeNode[];
}

export interface StrataConfig {
  outDir: string;
  browser: boolean;
  cache: boolean;
  port: number;
  since?: string;
  allRefs: boolean;
  ignore: string[];
  concurrency: number;
  minCoupling: number;
  format: DashboardFormat;
  watch: boolean;
  ci: boolean;
}

export interface AnalyseResult {
  reportPath: string;
  outputDir: string;
  report: StrataReport;
}

export interface ServeResult {
  url: string;
  reportPath: string;
}

export interface MetricDiffEntry {
  filePath: string;
  hotspotDelta?: number;
  busFactorDelta?: number;
  ageDelta?: number;
  locDelta?: number;
}

export interface MetricDiffReport {
  fromSha: string;
  toSha: string;
  entries: MetricDiffEntry[];
}

export interface FileMetricLookup {
  hotspots: Map<string, HotspotMetric>;
  busFactor: Map<string, BusFactorMetric>;
  age: Map<string, AgeMetric>;
  loc: Map<string, LocMetric>;
}
