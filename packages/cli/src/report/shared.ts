import type {
  AgeMetric,
  AuthorMetric,
  BusFactorMetric,
  HotspotMetric,
  LocMetric,
  StrataConfig,
  StrataReport,
} from "@strata/core";

import type { RepositorySnapshot } from "../git.js";

export const SCHEMA_VERSION = 1;
export const STRATA_VERSION = "1.0.0";

export interface ReportBuildContext {
  config: StrataConfig;
  snapshot: RepositorySnapshot;
}

export interface FileComputation {
  loc: LocMetric;
  complexity: number;
  hotspot: HotspotMetric;
  busFactor: BusFactorMetric;
  age: AgeMetric;
}

export interface AuthorAggregate {
  canonicalName: string;
  emails: Set<string>;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  firstCommit: number;
  lastCommit: number;
  touchedFiles: Set<string>;
  directories: Map<string, number>;
  languages: Map<string, number>;
  heatmap: Map<string, number>;
}

export interface ReportBundle {
  report: StrataReport;
  reportPath: string;
  reportDir: string;
  config: StrataConfig;
}

