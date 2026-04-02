import path from "node:path";

import type {
  AuthorMetric,
  Commit,
  ChurnSeries,
  LocSnapshot,
  RepoBusFactorSummary,
  RepoDashboardSummary,
  SummaryKpi,
} from "@strata/core";

import { clamp } from "@strata/core";

import type { AuthorAggregate, FileComputation, ReportBuildContext } from "./shared.js";
import { buildContributorGraph } from "./coupling.js";
import { formatNumber } from "../utils.js";

/**
 * Builds the dashboard summary payload from the current repository snapshot.
 *
 * @param context The report build context.
 * @param computations File-level metrics used by the summary.
 * @returns The dashboard summary section.
 */
export function buildSummary(
  context: ReportBuildContext,
  computations: readonly FileComputation[],
): RepoDashboardSummary {
  const hotFiles = computations.filter((entry) => entry.hotspot.hotspotScore >= 50);
  const riskyFiles = computations
    .filter((entry) => entry.busFactor.busFactor <= 1)
    .sort((left, right) => left.busFactor.busFactor - right.busFactor.busFactor)
    .map((entry) => entry.busFactor)
    .slice(0, 10);

  return {
    kpis: buildKpis(context, hotFiles.length, riskyFiles.length),
    topHotspots: computations
      .map((entry) => entry.hotspot)
      .sort((left, right) => right.hotspotScore - left.hotspotScore)
      .slice(0, 10),
    topRisks: riskyFiles,
    languageBreakdown: buildLanguageBreakdown(computations),
    activityHeatmap: buildHeatmap(context.snapshot.commits),
    churnTrend: buildChurnTrend(context.snapshot.commits),
  };
}

/**
 * Builds the bus-factor summary and contributor graph.
 *
 * @param computations File-level metrics used to derive ownership.
 * @returns The bus-factor summary section.
 */
export function buildRepoBusFactorSummary(
  computations: readonly FileComputation[],
): RepoBusFactorSummary {
  const criticalFiles = computations
    .map((entry) => entry.busFactor)
    .filter((entry) => entry.busFactor === 1);
  const totalWeight = computations.reduce((sum, entry) => sum + entry.loc.codeLines, 0);
  const repoWideScore =
    totalWeight === 0
      ? 0
      : computations.reduce((sum, entry) => sum + entry.busFactor.busFactor * entry.loc.codeLines, 0) /
        totalWeight;

  return {
    repoWideScore,
    criticalFiles,
    contributorGraph: buildContributorGraph(computations),
  };
}

/**
 * Builds author intelligence metrics from repository history.
 *
 * @param context The report build context.
 * @param computations File-level metrics used to resolve languages.
 * @returns The author metrics array.
 */
export function buildAuthorMetrics(
  context: ReportBuildContext,
  computations: readonly FileComputation[],
): AuthorMetric[] {
  const aggregates = new Map<string, AuthorAggregate>();
  for (const commit of context.snapshot.commits) {
    const aggregate = aggregates.get(commit.author) ?? createAuthorAggregate(commit.author);
    aggregate.emails.add(commit.email);
    aggregate.totalCommits += 1;
    aggregate.totalInsertions += commit.insertions;
    aggregate.totalDeletions += commit.deletions;
    aggregate.firstCommit = Math.min(aggregate.firstCommit, commit.timestamp);
    aggregate.lastCommit = Math.max(aggregate.lastCommit, commit.timestamp);

    for (const filePath of commit.filesChanged) {
      aggregate.touchedFiles.add(filePath);
      const directory = path.posix.dirname(filePath);
      aggregate.directories.set(directory, (aggregate.directories.get(directory) ?? 0) + 1);
      const language =
        computations.find((entry) => entry.loc.filePath === filePath)?.loc.language ?? "unknown";
      aggregate.languages.set(language, (aggregate.languages.get(language) ?? 0) + 1);
      const date = new Date(commit.timestamp).toISOString().slice(0, 10);
      aggregate.heatmap.set(date, (aggregate.heatmap.get(date) ?? 0) + 1);
    }

    aggregates.set(commit.author, aggregate);
  }

  return Array.from(aggregates.values())
    .map((aggregate): AuthorMetric => ({
      canonicalName: aggregate.canonicalName,
      emails: Array.from(aggregate.emails).sort(),
      totalCommits: aggregate.totalCommits,
      totalInsertions: aggregate.totalInsertions,
      totalDeletions: aggregate.totalDeletions,
      firstCommit: aggregate.firstCommit,
      lastCommit: aggregate.lastCommit,
      activeDays: Math.max(1, Math.round((aggregate.lastCommit - aggregate.firstCommit) / 86_400_000) + 1),
      primaryLanguages: Array.from(aggregate.languages.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([language]) => language),
      primaryDirectories: Array.from(aggregate.directories.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([directory]) => directory),
      specialisationScore: computeSpecialisationScore(aggregate),
      commitHeatmap: Array.from(aggregate.heatmap.entries()).map(([date, count]) => ({
        date,
        count,
        week: getWeekNumber(new Date(`${date}T00:00:00.000Z`)),
        day: new Date(`${date}T00:00:00.000Z`).getUTCDay(),
      })),
      peakHour: 12,
      peakDayOfWeek: 1,
    }))
    .sort((left, right) => right.totalCommits - left.totalCommits);
}

/**
 * Builds a hierarchical LOC history series for the dashboard.
 *
 * @param commits Repository commits used to derive the trend.
 * @returns LOC snapshots over time.
 */
export function buildLocHistory(commits: readonly Commit[]): LocSnapshot[] {
  const weekly = new Map<string, LocSnapshot>();
  for (const commit of commits) {
    const date = new Date(commit.timestamp);
    const week = `${date.getUTCFullYear()}-${String(getWeekNumber(date)).padStart(2, "0")}`;
    const existing = weekly.get(week) ?? {
      date: week,
      totalLoc: 0,
      byLanguage: {},
      byCategory: {},
    };
    existing.totalLoc += commit.insertions + commit.deletions;
    weekly.set(week, existing);
  }

  return Array.from(weekly.values()).sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Builds KPI cards for the dashboard summary.
 *
 * @param context The report build context.
 * @param hotspotCount The number of files above the hotspot threshold.
 * @param riskyCount The number of single-owner files.
 * @returns KPI card data for the overview page.
 */
function buildKpis(
  context: ReportBuildContext,
  hotspotCount: number,
  riskyCount: number,
): SummaryKpi[] {
  return [
    { id: "commits", label: "Commits", value: formatNumber(context.snapshot.commits.length) },
    { id: "files", label: "Files", value: formatNumber(context.snapshot.trackedFiles.length) },
    {
      id: "authors",
      label: "Authors",
      value: formatNumber(new Set(context.snapshot.commits.map((commit) => commit.author)).size),
    },
    { id: "hotspots", label: "Hotspots", value: formatNumber(hotspotCount) },
    { id: "single-owner", label: "Single-owner files", value: formatNumber(riskyCount) },
  ];
}

function buildLanguageBreakdown(computations: readonly FileComputation[]): Record<string, number> {
  return computations.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.loc.language] = (accumulator[entry.loc.language] ?? 0) + entry.loc.codeLines;
    return accumulator;
  }, {});
}

function buildHeatmap(commits: readonly Commit[]): Array<{ date: string; count: number; week: number; day: number }> {
  const counts = new Map<string, { date: string; count: number; week: number; day: number }>();
  for (const commit of commits) {
    const date = new Date(commit.timestamp);
    const key = date.toISOString().slice(0, 10);
    const week = getWeekNumber(date);
    const day = date.getUTCDay();
    const existing = counts.get(key) ?? { date: key, count: 0, week, day };
    existing.count += 1;
    counts.set(key, existing);
  }

  return Array.from(counts.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildChurnTrend(commits: readonly Commit[]): ChurnSeries[] {
  const weeks = new Map<string, { insertions: number; deletions: number; files: Set<string> }>();
  for (const commit of commits) {
    const period = commit.date.slice(0, 10);
    const existing = weeks.get(period) ?? {
      insertions: 0,
      deletions: 0,
      files: new Set<string>(),
    };
    existing.insertions += commit.insertions;
    existing.deletions += commit.deletions;
    for (const filePath of commit.filesChanged) {
      existing.files.add(filePath);
    }
    weeks.set(period, existing);
  }

  return Array.from(weeks.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, value]) => ({
      period,
      totalInsertions: value.insertions,
      totalDeletions: value.deletions,
      churnScore: value.insertions + value.deletions,
      fileCount: value.files.size,
    }));
}

function createAuthorAggregate(name: string): AuthorAggregate {
  return {
    canonicalName: name,
    emails: new Set<string>(),
    totalCommits: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    firstCommit: Number.POSITIVE_INFINITY,
    lastCommit: 0,
    touchedFiles: new Set<string>(),
    directories: new Map<string, number>(),
    languages: new Map<string, number>(),
    heatmap: new Map<string, number>(),
  };
}

function computeSpecialisationScore(aggregate: AuthorAggregate): number {
  const total = Array.from(aggregate.directories.values()).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }

  const top = Math.max(...Array.from(aggregate.directories.values()), 0);
  return clamp(top / total, 0, 1);
}

function getWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
