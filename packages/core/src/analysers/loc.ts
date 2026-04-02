import type { FileCategory, Granularity, LocMetric, LocSnapshot } from "../types.js";
import { classifyFileCategory, detectLanguageFromPath } from "../static/languageDetect.js";
import { countLocFromContent } from "../static/locCounter.js";

export type LocInput = Readonly<{
  content: string;
  filePath: string;
  language?: string;
  category?: FileCategory;
}>;

export type LocHistoryPoint = Readonly<{
  date: string;
  files: readonly LocInput[];
}>;

export type LocOptions = Readonly<{
  granularity?: Granularity;
}>;

/**
 * Calculates current LOC metrics and optional historical snapshots.
 *
 * @param files The files to measure.
 * @param history Optional historical snapshots to bucket over time.
 * @param options Optional calculation settings.
 * @returns The current LOC metrics plus historical snapshots.
 */
export function analyseLoc(
  files: readonly LocInput[],
  history: readonly LocHistoryPoint[] = [],
  options: LocOptions = {},
): { current: LocMetric[]; history: LocSnapshot[] } {
  const current = files
    .map((file) => buildCurrentMetric(file))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));

  return {
    current,
    history: getLocOverTime(history, options.granularity ?? "week"),
  };
}

/**
 * Buckets historical file snapshots into LOC over time.
 *
 * @param history The raw history points to aggregate.
 * @param granularity The time bucket size.
 * @returns LOC snapshots grouped by the requested granularity.
 */
export function getLocOverTime(
  history: readonly LocHistoryPoint[],
  granularity: Granularity,
): LocSnapshot[] {
  const buckets = new Map<string, LocSnapshot>();

  for (const point of history) {
    const bucketKey = bucketDate(point.date, granularity);
    const aggregate = buckets.get(bucketKey) ?? {
      date: bucketKey,
      totalLoc: 0,
      byLanguage: {},
      byCategory: {},
    };

    for (const file of point.files) {
      const language = file.language ?? detectLanguageFromPath(file.filePath);
      const category = resolveCategory(file);
      const counts = countLocFromContent(file.content, language);
      aggregate.totalLoc += counts.codeLines;
      aggregate.byLanguage[language] = (aggregate.byLanguage[language] ?? 0) + counts.codeLines;
      aggregate.byCategory[category] = (aggregate.byCategory[category] ?? 0) + counts.codeLines;
    }

    buckets.set(bucketKey, aggregate);
  }

  return Array.from(buckets.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildCurrentMetric(file: LocInput): LocMetric {
  const language = file.language ?? detectLanguageFromPath(file.filePath);
  const counts = countLocFromContent(file.content, language);

  return {
    filePath: file.filePath,
    language,
    category: file.category ?? classifyFileCategory(file.filePath, language),
    totalLines: counts.totalLines,
    codeLines: counts.codeLines,
    commentLines: counts.commentLines,
    blankLines: counts.blankLines,
    commentRatio: counts.codeLines > 0 ? counts.commentLines / counts.codeLines : counts.commentLines,
  };
}

function resolveCategory(file: LocInput): FileCategory {
  return file.category ?? classifyFileCategory(file.filePath, file.language ?? detectLanguageFromPath(file.filePath));
}

function bucketDate(date: string, granularity: Granularity): string {
  const value = new Date(date);

  if (granularity === "month") {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  if (granularity === "week") {
    return `${value.getUTCFullYear()}-W${String(weekOfYear(value)).padStart(2, "0")}`;
  }

  return value.toISOString().slice(0, 10);
}

function weekOfYear(date: Date): number {
  const firstJanuary = Date.UTC(date.getUTCFullYear(), 0, 1);
  const diff = date.getTime() - firstJanuary;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}
