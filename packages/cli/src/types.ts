import type { DashboardFormat, StrataConfig, StrataReport } from "@strata/core";

export interface AnalyseCommandOptions {
  out?: string;
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
}

export interface ServeCommandOptions {
  port: number;
  browser: boolean;
}

export interface CliContext {
  repoPath: string;
  config: StrataConfig;
  reportDir: string;
}

export interface ServeHandle {
  url: string;
  close: () => Promise<void>;
}

export interface ReportBundle {
  report: StrataReport;
  reportPath: string;
}
