import pc from "picocolors";

import type {
  MetricDiffReport,
  StrataReport,
  SummaryKpi,
} from "@strata/core";

import { formatDuration, formatNumber } from "./utils.js";

/**
 * Renders the standard post-analysis summary table to stdout.
 *
 * @param report The generated Strata report.
 * @param url Optional dashboard URL when a server is running.
 * @returns Nothing.
 */
export function printSummaryTable(
  report: StrataReport,
  url?: string,
): void {
  const lines: string[] = [];
  lines.push(pc.bold("Strata analysis complete"));
  lines.push(`Repo: ${report.meta.repoName}`);
  lines.push(`HEAD: ${report.meta.headSha.slice(0, 7)}`);
  lines.push(`Files: ${formatNumber(report.meta.totalFiles)}`);
  lines.push(`Commits: ${formatNumber(report.meta.totalCommits)}`);
  lines.push(`Authors: ${formatNumber(report.meta.totalAuthors)}`);
  lines.push(`Duration: ${formatDuration(report.meta.analysisDurationMs)}`);

  if (url) {
    lines.push(`Dashboard: ${pc.cyan(url)}`);
  }

  lines.push("");
  lines.push(renderKpiTable(report.summary.kpis));
  lines.push("");
  lines.push(renderTopFilesTable(report));

  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Prints a concise diff summary between two commits.
 *
 * @param report The computed diff report.
 * @returns Nothing.
 */
export function printDiffTable(report: MetricDiffReport): void {
  const rows = report.entries.slice(0, 20);
  const header = [
    pc.bold(`Diff ${report.fromSha.slice(0, 7)}..${report.toSha.slice(0, 7)}`),
    "file | hotspot | bus factor | age | loc",
    "----- | ------- | ---------- | --- | ---",
  ];

  const body = rows.map((entry) => {
    return [
      entry.filePath,
      formatSigned(entry.hotspotDelta),
      formatSigned(entry.busFactorDelta),
      formatSigned(entry.ageDelta),
      formatSigned(entry.locDelta),
    ].join(" | ");
  });

  process.stdout.write(`${[...header, ...body].join("\n")}\n`);
}

/**
 * Prints the location of a running report server.
 *
 * @param url The server URL.
 * @param reportPath The report path being served.
 * @returns Nothing.
 */
export function printServeInfo(url: string, reportPath: string): void {
  process.stdout.write(
    `${pc.green("Serving")} ${pc.cyan(url)} ${pc.dim(`(${reportPath})`)}\n`,
  );
}

function renderKpiTable(kpis: readonly SummaryKpi[]): string {
  if (kpis.length === 0) {
    return pc.dim("No KPI data available.");
  }

  const rows = kpis.map((kpi) => {
    const change = kpi.change === undefined ? "-" : formatSigned(kpi.change);
    return [kpi.label, String(kpi.value), change].join(" | ");
  });

  return [`kpi | value | change`, `--- | --- | ---`, ...rows].join("\n");
}

function renderTopFilesTable(report: StrataReport): string {
  const rows = report.hotspots.slice(0, 5).map((hotspot) => {
    return [
      hotspot.filePath,
      hotspot.riskLevel,
      hotspot.hotspotScore.toFixed(1),
      formatNumber(hotspot.loc),
    ].join(" | ");
  });

  if (rows.length === 0) {
    return pc.dim("No hotspot data available.");
  }

  return [`top files | risk | score | loc`, `--- | --- | --- | ---`, ...rows].join(
    "\n",
  );
}

function formatSigned(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}
