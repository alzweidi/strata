import type { AuthorMetric, Commit, HeatmapCell } from "../types.js";
import { detectLanguageFromPath } from "../static/languageDetect.js";

export type AuthorOptions = Readonly<{
  days?: number;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_COUNT = 7;
const HOURS_PER_DAY = 24;

/**
 * Aggregates repository author activity into contribution and specialisation
 * metrics.
 *
 * @param commits The commit history to analyse.
 * @param options Optional calculation settings.
 * @returns Author metrics ordered by contribution volume.
 */
export function analyseAuthors(
  commits: readonly Commit[],
  options: AuthorOptions = {},
): AuthorMetric[] {
  const windowDays = options.days ?? 364;
  const latestCommit = commits.reduce((latest, commit) => Math.max(latest, commit.timestamp), 0);
  const earliestWindow = latestCommit > 0 ? latestCommit - windowDays * DAY_MS : 0;
  const grouped = groupCommits(commits);

  return Array.from(grouped.values())
    .map((activity) => buildAuthorMetric(activity, earliestWindow, windowDays))
    .sort((left, right) => right.totalCommits - left.totalCommits || left.canonicalName.localeCompare(right.canonicalName));
}

type AuthorActivity = Readonly<{
  canonicalName: string;
  displayName: string;
  emails: Set<string>;
  commits: Commit[];
}>;

function groupCommits(commits: readonly Commit[]): Map<string, AuthorActivity> {
  const grouped = new Map<string, AuthorActivity>();

  for (const commit of commits) {
    const key = canonicalKey(commit.author, commit.email);
    const existing = grouped.get(key);

    if (existing) {
      existing.commits.push(commit);
      existing.emails.add(commit.email);
      continue;
    }

    grouped.set(key, {
      canonicalName: normalizeAuthorName(commit.author, commit.email),
      displayName: commit.author || commit.email,
      emails: new Set([commit.email]),
      commits: [commit],
    });
  }

  return grouped;
}

function buildAuthorMetric(
  activity: AuthorActivity,
  earliestWindow: number,
  windowDays: number,
): AuthorMetric {
  const commits = [...activity.commits].sort((left, right) => left.timestamp - right.timestamp);
  const commitTimes = commits.map((commit) => commit.timestamp);
  const touchedFiles = commits.flatMap((commit) => commit.filesChanged);
  const directoryWeights = bucketDirectories(touchedFiles);
  const languageWeights = bucketLanguages(touchedFiles);
  const heatmap = buildHeatmap(commits, earliestWindow, windowDays);
  const peakHour = peakBucket(commits, (date) => date.getUTCHours(), HOURS_PER_DAY);
  const peakDayOfWeek = peakBucket(commits, (date) => date.getUTCDay(), WEEKDAY_COUNT);

  return {
    canonicalName: activity.canonicalName,
    emails: Array.from(activity.emails).sort((left, right) => left.localeCompare(right)),
    totalCommits: commits.length,
    totalInsertions: commits.reduce((sum, commit) => sum + commit.insertions, 0),
    totalDeletions: commits.reduce((sum, commit) => sum + commit.deletions, 0),
    firstCommit: commitTimes[0] ?? 0,
    lastCommit: commitTimes.at(-1) ?? 0,
    activeDays: countUniqueDays(commitTimes),
    primaryLanguages: topBuckets(languageWeights, 3),
    primaryDirectories: topBuckets(directoryWeights, 3),
    specialisationScore: calculateSpecialisation(directoryWeights, languageWeights),
    commitHeatmap: heatmap,
    peakHour,
    peakDayOfWeek,
  };
}

function canonicalKey(author: string, email: string): string {
  return normalizeAuthorName(author, email).toLowerCase();
}

function normalizeAuthorName(author: string, email: string): string {
  if (author.trim().length > 0) {
    return author.trim().replace(/\s+/g, " ");
  }

  return email.split("@", 1)[0] ?? "unknown";
}

function bucketDirectories(paths: readonly string[]): Map<string, number> {
  const buckets = new Map<string, number>();

  for (const filePath of paths) {
    const segments = filePath.split("/").filter(Boolean);
    const directory = segments.length > 1 ? segments[0] ?? "root" : "root";
    buckets.set(directory, (buckets.get(directory) ?? 0) + 1);
  }

  return buckets;
}

function bucketLanguages(paths: readonly string[]): Map<string, number> {
  const buckets = new Map<string, number>();

  for (const filePath of paths) {
    const language = detectLanguageFromPath(filePath);
    buckets.set(language, (buckets.get(language) ?? 0) + 1);
  }

  return buckets;
}

function calculateSpecialisation(
  directoryWeights: ReadonlyMap<string, number>,
  languageWeights: ReadonlyMap<string, number>,
): number {
  return (concentration(directoryWeights) + concentration(languageWeights)) / 2;
}

function concentration(weights: ReadonlyMap<string, number>): number {
  const total = Array.from(weights.values()).reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return 0;
  }

  return Array.from(weights.values())
    .map((value) => value / total)
    .reduce((sum, share) => sum + share * share, 0);
}

function buildHeatmap(commits: readonly Commit[], earliestWindow: number, windowDays: number): HeatmapCell[] {
  const counts = new Map<string, number>();
  const start = floorToUtcDay(earliestWindow > 0 ? earliestWindow : commits[0]?.timestamp ?? 0);

  for (const commit of commits) {
    if (commit.timestamp < start) {
      continue;
    }

    const dayIndex = Math.floor((commit.timestamp - start) / DAY_MS);
    const week = Math.floor(dayIndex / WEEKDAY_COUNT);
    const day = new Date(commit.timestamp).getUTCDay();
    const date = new Date(start + dayIndex * DAY_MS).toISOString().slice(0, 10);
    const key = `${date}:${week}:${day}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: HeatmapCell[] = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = new Date(start + offset * DAY_MS);
    const isoDate = date.toISOString().slice(0, 10);
    const week = Math.floor(offset / WEEKDAY_COUNT);
    const day = date.getUTCDay();
    const key = `${isoDate}:${week}:${day}`;
    cells.push({
      date: isoDate,
      count: counts.get(key) ?? 0,
      week,
      day,
    });
  }

  return cells;
}

function floorToUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function peakBucket(
  commits: readonly Commit[],
  selector: (date: Date) => number,
  size: number,
): number {
  const counts = new Array<number>(size).fill(0);

  for (const commit of commits) {
    const index = selector(new Date(commit.timestamp));
    counts[index] = (counts[index] ?? 0) + 1;
  }

  let peakIndex = 0;
  let peakCount = -1;

  for (const [index, count] of counts.entries()) {
    if (count > peakCount) {
      peakCount = count;
      peakIndex = index;
    }
  }

  return peakIndex;
}

function countUniqueDays(timestamps: readonly number[]): number {
  const days = new Set(timestamps.map((timestamp) => new Date(timestamp).toISOString().slice(0, 10)));
  return days.size;
}

function topBuckets(weights: ReadonlyMap<string, number>, limit: number): string[] {
  return Array.from(weights.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name]) => name);
}
