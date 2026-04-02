import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { simpleGit } from "simple-git";

import { ensureOutputDir, loadConfig } from "./config.js";
import { buildFileTree } from "./fileTree.js";
import {
  getAllFilesBlame,
  getCommitCoupling,
  getCommitHistory,
  getFileChurn,
} from "./git/index.js";
import {
  analyseAge,
  analyseAuthors,
  analyseBusFactor,
  buildCouplingGraph,
  analyseHotspots,
  analyseLoc,
} from "./analysers/index.js";
import type {
  AnalyseResult,
  AgeMetric,
  BusFactorMetric,
  Commit,
  FileChurn,
  FileMetricLookup,
  HeatmapCell,
  HotspotMetric,
  LogOptions,
  LocMetric,
  RepoDashboardSummary,
  StrataConfig,
  StrataReport,
} from "./types.js";

const STRATA_VERSION = "1.0.0";
const SCHEMA_VERSION = 1;

/**
 * Runs the full Strata analysis pipeline for a repository and writes the
 * resulting `report.json` to the configured output directory.
 *
 * @param repoPath The repository root to analyse.
 * @param overrides Partial configuration overrides from the CLI.
 * @returns The generated report and output file locations.
 */
export async function analyseRepository(
  repoPath: string,
  overrides: Partial<StrataConfig> = {},
): Promise<AnalyseResult> {
  const startedAt = performance.now();
  const config = await loadConfig(repoPath, overrides);
  const outputDir = await ensureOutputDir(config);
  const reportPath = path.join(outputDir, "report.json");
  const git = simpleGit(repoPath);

  const [headSha, headDate] = await Promise.all([
    git.revparse(["HEAD"]),
    git.show(["-s", "--format=%cI", "HEAD"]),
  ]);

  if (config.cache) {
    const cached = await readExistingReport(reportPath, headSha.trim());

    if (cached) {
      return {
        outputDir,
        reportPath,
        report: cached,
      };
    }
  }

  const trackedFiles = await getTrackedFiles(git);
  const logOptions: LogOptions = {};
  if (config.since) {
    logOptions.since = config.since;
  }
  const commits = await getCommitHistory(repoPath, logOptions);
  const [churnByFile, blameByFile, coupling] = await Promise.all([
    getFileChurn(repoPath),
    getAllFilesBlame(repoPath, config.concurrency),
    getCommitCoupling(repoPath, config.minCoupling),
  ]);
  const fileContents = await readTrackedFiles(repoPath, trackedFiles);
  const hotspotInputs = trackedFiles.map((filePath) => {
    const churn = churnByFile.get(filePath);
    return {
      filePath,
      content: fileContents.get(filePath) ?? "",
      churnScore: churn?.churnScore ?? 0,
      lastTouched: churn?.lastChanged ?? 0,
      touchCount: churn?.totalCommits ?? 0,
    };
  });
  const locInputs = trackedFiles.map((filePath) => ({
    filePath,
    content: fileContents.get(filePath) ?? "",
  }));
  const blameFiles = Array.from(blameByFile.values());
  const locHistory = buildLocHistory(commits, trackedFiles, fileContents);

  const [hotspots, busFactor, age, couplingGraph, loc, authors] =
    await Promise.all([
      Promise.resolve(analyseHotspots(hotspotInputs)),
      Promise.resolve(analyseBusFactor(blameFiles, { commits })),
      Promise.resolve(analyseAge(blameFiles)),
      Promise.resolve(
        buildCouplingGraph(coupling, {
          minCoChanges: config.minCoupling,
        }),
      ),
      Promise.resolve(
        analyseLoc(locInputs, locHistory, {
          granularity: "week",
        }),
      ),
      Promise.resolve(analyseAuthors(commits)),
    ]);

  const fileTree = buildFileTree(
    trackedFiles,
    toMetricLookup(hotspots, busFactor.criticalFiles, age, loc.current),
  );
  const report: StrataReport = {
    meta: {
      strataVersion: STRATA_VERSION,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: Date.now(),
      repoPath,
      repoName: path.basename(repoPath),
      headSha: headSha.trim(),
      headDate: headDate.trim(),
      totalCommits: commits.length,
      totalFiles: trackedFiles.length,
      totalAuthors: authors.length,
      analysisDurationMs: Math.round(performance.now() - startedAt),
    },
    summary: buildSummary(hotspots, busFactor.criticalFiles, loc.current, authors, commits, churnByFile),
    hotspots,
    busFactor,
    age,
    coupling: couplingGraph,
    loc,
    authors,
    commits,
    fileTree,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  return {
    outputDir,
    reportPath,
    report,
  };
}

async function readExistingReport(
  reportPath: string,
  headSha: string,
): Promise<StrataReport | undefined> {
  try {
    const [info, raw] = await Promise.all([stat(reportPath), readFile(reportPath, "utf8")]);

    if (!info.isFile()) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as StrataReport;
    return parsed.meta.headSha === headSha ? parsed : undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function getTrackedFiles(
  git: ReturnType<typeof simpleGit>,
): Promise<string[]> {
  const raw = await git.raw(["ls-files"]);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readTrackedFiles(
  repoPath: string,
  trackedFiles: readonly string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    trackedFiles.map(async (filePath) => {
      const absolutePath = path.join(repoPath, filePath);

      try {
        const content = await readFile(absolutePath, "utf8");
        return [filePath, content] as const;
      } catch {
        return [filePath, ""] as const;
      }
    }),
  );

  return new Map(entries);
}

function buildLocHistory(
  commits: readonly Commit[],
  trackedFiles: readonly string[],
  fileContents: Map<string, string>,
): LocHistoryPoint[] {
  const bucketMap = new Map<string, Set<string>>();

  for (const commit of commits) {
    const date = commit.date.slice(0, 10);
    const existing = bucketMap.get(date) ?? new Set<string>();

    for (const filePath of commit.filesChanged) {
      if (trackedFiles.includes(filePath)) {
        existing.add(filePath);
      }
    }

    bucketMap.set(date, existing);
  }

  return [...bucketMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, files]) => ({
      date,
      files: [...files].map((filePath) => ({
        filePath,
        content: fileContents.get(filePath) ?? "",
      })),
    }));
}

function toMetricLookup(
  hotspots: readonly HotspotMetric[],
  criticalFiles: readonly BusFactorMetric[],
  age: readonly AgeMetric[],
  loc: readonly LocMetric[],
): FileMetricLookup {
  return {
    hotspots: new Map(hotspots.map((metric) => [metric.filePath, metric])),
    busFactor: new Map(criticalFiles.map((metric) => [metric.filePath, metric])),
    age: new Map(age.map((metric) => [metric.filePath, metric])),
    loc: new Map(loc.map((metric) => [metric.filePath, metric])),
  };
}

function buildSummary(
  hotspots: readonly HotspotMetric[],
  criticalFiles: readonly BusFactorMetric[],
  loc: readonly LocMetric[],
  authors: readonly { commitHeatmap: HeatmapCell[] }[],
  commits: readonly Commit[],
  churnByFile: Map<string, FileChurn>,
): RepoDashboardSummary {
  const languageBreakdown: Record<string, number> = {};

  for (const metric of loc) {
    languageBreakdown[metric.language] =
      (languageBreakdown[metric.language] ?? 0) + metric.codeLines;
  }

  const activityHeatmap = mergeHeatmaps(authors.flatMap((author) => author.commitHeatmap));
  const churnTrend = bucketCommits(commits, churnByFile);

  return {
    kpis: [
      {
        id: "files",
        label: "Tracked Files",
        value: hotspots.length,
        tone: "neutral",
      },
      {
        id: "critical-hotspots",
        label: "Critical Hotspots",
        value: hotspots.filter((metric) => metric.riskLevel === "critical").length,
        tone: "danger",
      },
      {
        id: "single-owner-files",
        label: "Single Owner Files",
        value: criticalFiles.length,
        tone: "warning",
      },
      {
        id: "authors",
        label: "Active Authors",
        value: authors.length,
        tone: "accent",
      },
    ],
    topHotspots: [...hotspots]
      .sort((left, right) => right.hotspotScore - left.hotspotScore)
      .slice(0, 8),
    topRisks: [...criticalFiles].slice(0, 8),
    languageBreakdown,
    activityHeatmap,
    churnTrend,
  };
}

function mergeHeatmaps(cells: readonly HeatmapCell[]): HeatmapCell[] {
  const byDate = new Map<string, HeatmapCell>();

  for (const cell of cells) {
    const existing = byDate.get(cell.date);

    if (existing) {
      existing.count += cell.count;
      continue;
    }

    byDate.set(cell.date, { ...cell });
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function bucketCommits(
  commits: readonly Commit[],
  churnByFile: Map<string, FileChurn>,
): RepoDashboardSummary["churnTrend"] {
  const buckets = new Map<string, { insertions: number; deletions: number; files: Set<string> }>();

  for (const commit of commits) {
    const period = commit.date.slice(0, 10);
    const current = buckets.get(period) ?? {
      insertions: 0,
      deletions: 0,
      files: new Set<string>(),
    };
    current.insertions += commit.insertions;
    current.deletions += commit.deletions;

    for (const filePath of commit.filesChanged) {
      if (churnByFile.has(filePath)) {
        current.files.add(filePath);
      }
    }

    buckets.set(period, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, value]) => ({
      period,
      totalInsertions: value.insertions,
      totalDeletions: value.deletions,
      churnScore: value.insertions + value.deletions,
      fileCount: value.files.size,
    }));
}

/**
 * Produces a small metric diff summary between two reports for the CLI diff
 * command.
 *
 * @param previousReport The earlier report snapshot.
 * @param nextReport The later report snapshot.
 * @returns A lightweight file-level diff structure.
 */
export function diffReports(
  previousReport: StrataReport,
  nextReport: StrataReport,
): {
  fromSha: string;
  toSha: string;
  entries: Array<{
    filePath: string;
    hotspotDelta: number;
    busFactorDelta: number;
    ageDelta: number;
    locDelta: number;
  }>;
} {
  const previousHotspots = new Map(
    previousReport.hotspots.map((metric) => [metric.filePath, metric]),
  );
  const previousBusFactor = new Map(
    previousReport.busFactor.criticalFiles.map((metric) => [metric.filePath, metric]),
  );
  const previousAge = new Map(previousReport.age.map((metric) => [metric.filePath, metric]));
  const previousLoc = new Map(
    previousReport.loc.current.map((metric) => [metric.filePath, metric]),
  );

  return {
    fromSha: previousReport.meta.headSha,
    toSha: nextReport.meta.headSha,
    entries: nextReport.hotspots.map((metric) => ({
      filePath: metric.filePath,
      hotspotDelta:
        metric.hotspotScore -
        (previousHotspots.get(metric.filePath)?.hotspotScore ?? 0),
      busFactorDelta:
        (nextReport.busFactor.criticalFiles.find(
          (entry) => entry.filePath === metric.filePath,
        )?.busFactor ?? 0) -
        (previousBusFactor.get(metric.filePath)?.busFactor ?? 0),
      ageDelta:
        (nextReport.age.find((entry) => entry.filePath === metric.filePath)
          ?.medianLineAgeDays ?? 0) -
        (previousAge.get(metric.filePath)?.medianLineAgeDays ?? 0),
      locDelta:
        (nextReport.loc.current.find((entry) => entry.filePath === metric.filePath)
          ?.codeLines ?? 0) -
        (previousLoc.get(metric.filePath)?.codeLines ?? 0),
    })),
  };
}

/**
 * Converts a report into a CSV-friendly row set for the export command.
 *
 * @param report The report to flatten.
 * @returns String records keyed by metric name.
 */
export function reportToCsvRows(report: StrataReport): string[][] {
  return [
    ["filePath", "hotspotScore", "busFactor", "medianAgeDays", "codeLines"],
    ...report.hotspots.map((metric) => {
      const busFactor =
        report.busFactor.criticalFiles.find((entry) => entry.filePath === metric.filePath)
          ?.busFactor ?? 0;
      const medianAgeDays =
        report.age.find((entry) => entry.filePath === metric.filePath)
          ?.medianLineAgeDays ?? 0;
      const codeLines =
        report.loc.current.find((entry) => entry.filePath === metric.filePath)
          ?.codeLines ?? 0;

      return [
        metric.filePath,
        metric.hotspotScore.toFixed(2),
        busFactor.toString(),
        medianAgeDays.toString(),
        codeLines.toString(),
      ];
    }),
  ];
}
type LocHistoryPoint = {
  date: string;
  files: Array<{
    filePath: string;
    content: string;
  }>;
};
