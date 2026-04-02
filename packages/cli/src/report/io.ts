import { performance } from "node:perf_hooks";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  buildFileTree,
  clearOutputDirectory,
  createCacheKey,
  loadConfig,
  readCache,
  writeCache,
} from "@strata/core";
import type { FileMetricLookup, StrataConfig, StrataReport } from "@strata/core";

import { collectRepositorySnapshot, compareCommits, readRepositoryHead } from "../git.js";
import { resolveAbsolutePath } from "../utils.js";
import {
  SCHEMA_VERSION,
  STRATA_VERSION,
  type ReportBuildContext,
  type ReportBundle,
} from "./shared.js";
import {
  buildAuthorMetrics,
  buildLocHistory,
  buildRepoBusFactorSummary,
  buildSummary,
} from "./graphs.js";
import { buildCouplingGraph as buildCouplingGraphInternal } from "./coupling.js";
import { computeFileMetrics } from "./metrics.js";

/**
 * Analyses a repository and materialises the full Strata report bundle.
 *
 * @param repoPath The repository path to analyse.
 * @param overrides CLI overrides merged on top of `.stratarc.json`.
 * @returns The generated report bundle and output path.
 */
export async function analyseRepository(
  repoPath: string,
  overrides: Partial<StrataConfig>,
): Promise<ReportBundle> {
  const rootPath = resolveAbsolutePath(repoPath, process.cwd());
  const head = await readRepositoryHead(rootPath);
  const config = await loadConfig(head.repoPath, overrides);
  const reportDir = await ensureReportDir(config);
  const reportPath = path.join(reportDir, "report.json");
  const startedAt = performance.now();
  const cacheKey = createCacheKey(head.repoPath, head.headSha, "report", [
    config.since ?? "",
    config.allRefs,
    config.ignore,
    config.concurrency,
    config.minCoupling,
  ]);
  const cacheDir = path.join(reportDir, "cache");

  if (config.cache) {
    const cached = await readCache<StrataReport>(cacheDir, cacheKey);
    if (cached) {
      await writeReport(reportPath, cached);
      return { report: cached, reportPath, reportDir, config };
    }
  }

  const snapshot = await collectRepositorySnapshot(head.repoPath, config);
  const report = buildReport({ config, snapshot });
  report.meta.analysisDurationMs = Math.round(performance.now() - startedAt);
  await writeReport(reportPath, report);

  if (config.cache) {
    await writeCache(cacheDir, cacheKey, report);
  }

  return { report, reportPath, reportDir, config };
}

/**
 * Reads a stored report from disk.
 *
 * @param reportDir The directory containing `report.json`.
 * @returns The parsed report.
 */
export async function loadReport(reportDir: string): Promise<StrataReport> {
  const reportPath = path.join(reportDir, "report.json");
  const raw = await readFile(reportPath, "utf8");
  return JSON.parse(raw) as StrataReport;
}

/**
 * Writes a report to `report.json` in the target directory.
 *
 * @param reportPath The destination report file path.
 * @param report The report payload to serialise.
 * @returns The written report path.
 */
export async function writeReport(reportPath: string, report: StrataReport): Promise<string> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

/**
 * Deletes an output directory and its cache contents.
 *
 * @param reportDir The report directory to remove.
 * @returns Nothing.
 */
export async function removeReportDirectory(reportDir: string): Promise<void> {
  await clearOutputDirectory(reportDir);
}

/**
 * Computes a coarse diff between two commits.
 *
 * @param repoPath The repository path to inspect.
 * @param fromSha The base commit SHA.
 * @param toSha The target commit SHA.
 * @returns A metric diff report.
 */
export async function diffCommits(
  repoPath: string,
  fromSha: string,
  toSha: string,
): Promise<import("@strata/core").MetricDiffReport> {
  return compareCommits(repoPath, fromSha, toSha);
}

/**
 * Exports a report to JSON or CSV files.
 *
 * @param reportDir The output directory that already contains `report.json`.
 * @param format The export format.
 * @returns The generated file paths.
 */
export async function exportReport(
  reportDir: string,
  format: "json" | "csv",
): Promise<string[]> {
  const report = await loadReport(reportDir);
  const exportDir = path.join(reportDir, "export");
  await mkdir(exportDir, { recursive: true });

  if (format === "json") {
    const target = path.join(exportDir, "report.json");
    await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return [target];
  }

  return await writeCsvExports(exportDir, report);
}

function buildReport(context: ReportBuildContext): StrataReport {
  const computations = computeFileMetrics(context);
  const fileLookup: FileMetricLookup = {
    hotspots: new Map(computations.map((entry) => [entry.hotspot.filePath, entry.hotspot])),
    busFactor: new Map(computations.map((entry) => [entry.busFactor.filePath, entry.busFactor])),
    age: new Map(computations.map((entry) => [entry.age.filePath, entry.age])),
    loc: new Map(computations.map((entry) => [entry.loc.filePath, entry.loc])),
  };
  const authors = buildAuthorMetrics(context, computations);

  return {
    meta: {
      strataVersion: STRATA_VERSION,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: Date.now(),
      repoPath: context.snapshot.repoPath,
      repoName: context.snapshot.repoName,
      headSha: context.snapshot.headSha,
      headDate: context.snapshot.headDate,
      totalCommits: context.snapshot.commits.length,
      totalFiles: context.snapshot.trackedFiles.length,
      totalAuthors: authors.length,
      analysisDurationMs: 0,
    },
    summary: buildSummary(context, computations),
    hotspots: computations.map((entry) => entry.hotspot).sort((left, right) => right.hotspotScore - left.hotspotScore),
    busFactor: buildRepoBusFactorSummary(computations),
    age: computations.map((entry) => entry.age).sort((left, right) => right.medianLineAgeDays - left.medianLineAgeDays),
    coupling: buildCouplingGraphInternal(context, context.config.minCoupling),
    loc: {
      current: computations.map((entry) => entry.loc).sort((left, right) => right.codeLines - left.codeLines),
      history: buildLocHistory(context.snapshot.commits),
    },
    authors,
    commits: context.snapshot.commits,
    fileTree: buildFileTree(context.snapshot.trackedFiles, fileLookup),
  };
}

async function ensureReportDir(config: StrataConfig): Promise<string> {
  await mkdir(config.outDir, { recursive: true });
  return config.outDir;
}

async function writeCsvExports(exportDir: string, report: StrataReport): Promise<string[]> {
  const files: Array<{ name: string; content: string }> = [
    {
      name: "summary.csv",
      content: toCsv(
        report.summary.kpis.map((kpi) => ({
          id: kpi.id,
          label: kpi.label,
          value: String(kpi.value),
          change: kpi.change?.toFixed(2) ?? "",
        })),
      ),
    },
    {
      name: "hotspots.csv",
      content: toCsv(
        report.hotspots.map((hotspot) => ({
          filePath: hotspot.filePath,
          language: hotspot.language,
          loc: String(hotspot.loc),
          complexity: String(hotspot.complexity),
          churnScore: String(hotspot.churnScore),
          hotspotScore: hotspot.hotspotScore.toFixed(2),
          riskLevel: hotspot.riskLevel,
        })),
      ),
    },
    {
      name: "authors.csv",
      content: toCsv(
        report.authors.map((author) => ({
          canonicalName: author.canonicalName,
          emails: author.emails.join(";"),
          totalCommits: String(author.totalCommits),
          totalInsertions: String(author.totalInsertions),
          totalDeletions: String(author.totalDeletions),
          specialisationScore: author.specialisationScore.toFixed(2),
        })),
      ),
    },
  ];

  const written: string[] = [];
  for (const file of files) {
    const target = path.join(exportDir, file.name);
    await writeFile(target, `${file.content}\n`, "utf8");
    written.push(target);
  }

  return written;
}

function toCsv(rows: ReadonlyArray<Record<string, string>>): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? "")).join(","));
  }

  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (!/[,"\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
