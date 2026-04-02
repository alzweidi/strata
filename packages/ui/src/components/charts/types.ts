export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ChartOverlayMetric =
  | "medianAgeDays"
  | "churnScore"
  | "complexity"
  | "busFactor"
  | "loc"
  | "hotspotScore";

export type ChartTone = "neutral" | "accent" | "warning" | "danger";

export interface ChartComponentProps {
  /** Optional wrapper class for app-shell styling hooks. */
  className?: string;
  /** Total chart height in pixels, including any toolbar above the canvas. */
  height?: number;
}

export interface HotspotBubbleDatum {
  filePath: string;
  language: string;
  loc: number;
  complexity: number;
  churnScore: number;
  hotspotScore: number;
  riskLevel: RiskLevel;
  /** Unix timestamp of the last commit that touched the file. */
  lastTouched: number;
  /** Number of recorded touches used to size the bubble. */
  touchCount: number;
}

export interface HotspotThresholds {
  churn: number;
  complexity: number;
}

export interface HotspotBubbleProps extends ChartComponentProps {
  data: HotspotBubbleDatum[];
  /** Controlled selection coming from the app shell. */
  selectedFilePath?: string;
  /** Controlled bubble thresholds for the quadrant lines. */
  thresholds?: HotspotThresholds;
  onSelectFile?: (filePath: string | null) => void;
  onThresholdsChange?: (thresholds: HotspotThresholds) => void;
}

export interface CouplingGraphNodeDatum {
  id: string;
  degree: number;
  /** Graph centrality score used for secondary sizing/labels. */
  betweenness: number;
  directory: string;
}

export interface CouplingGraphEdgeDatum {
  source: string;
  target: string;
  strength: number;
  coChanges: number;
}

export interface CouplingGraphData {
  nodes: CouplingGraphNodeDatum[];
  edges: CouplingGraphEdgeDatum[];
  clusters: string[][];
}

export interface CouplingGraphProps extends ChartComponentProps {
  data: CouplingGraphData;
  /** Minimum coupling strength used to filter weak edges. */
  minimumStrength?: number;
  /** Controlled selected node id for neighbourhood highlighting. */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onMinimumStrengthChange?: (minimumStrength: number) => void;
}

export interface ChartTreeOverlay {
  churnScore?: number;
  hotspotScore?: number;
  complexity?: number;
  busFactor?: number;
  medianAgeDays?: number;
  loc?: number;
  primaryAuthor?: string;
  riskLevel?: RiskLevel;
}

export interface ChartTreeNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  /** Tree depth within the repository hierarchy. */
  depth: number;
  children: ChartTreeNode[];
  overlays: ChartTreeOverlay;
  /** Aggregated LOC used as the size basis for area-based charts. */
  aggregateLoc: number;
}

export interface AgeTreemapProps extends ChartComponentProps {
  nodes: ChartTreeNode[];
  /** Active overlay that drives the tile fill colour. */
  metric?: ChartOverlayMetric;
  /** Controlled selection path for drill-down/highlight state. */
  selectedPath?: string | null;
  onSelectNode?: (node: ChartTreeNode | null) => void;
  onMetricChange?: (metric: ChartOverlayMetric) => void;
}

export interface LocSnapshotDatum {
  date: string;
  totalLoc: number;
  byLanguage: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface LocTimelineAnnotation {
  date: string;
  label: string;
  /** Optional semantic emphasis for the annotation callout. */
  tone?: ChartTone;
}

export interface LocTimeRange {
  start: string;
  end: string;
}

export interface LocTimelineProps extends ChartComponentProps {
  snapshots: LocSnapshotDatum[];
  annotations?: LocTimelineAnnotation[];
  /** Controlled brush range for the visible time window. */
  selectedRange?: LocTimeRange | null;
  onRangeChange?: (range: LocTimeRange | null) => void;
}

export interface HeatmapCellDatum {
  date: string;
  count: number;
  /** Week index in the 52x7 grid. */
  week: number;
  /** Day index in the contribution grid, Sunday = 0. */
  day: number;
}

export interface AuthorHeatmapProps extends ChartComponentProps {
  cells: HeatmapCellDatum[];
  authorLabel?: string;
  /** Controlled selected date for external filtering. */
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
}

export interface AuthorshipSunburstProps extends ChartComponentProps {
  nodes: ChartTreeNode[];
  /** Controlled selected path for the focused sector. */
  selectedPath?: string | null;
  onSelectNode?: (node: ChartTreeNode | null) => void;
}
