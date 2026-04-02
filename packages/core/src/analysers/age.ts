import type { AgeBucket, AgeMetric, FileBlame, LineRange } from "../types.js";
import { median } from "../utils.js";

export type AgeOptions = Readonly<{
  now?: number;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const STABLE_ZONE_DAYS = 180;

/**
 * Calculates line-age metrics for a set of blamed files.
 *
 * @param files The blamed file snapshots to inspect.
 * @param options Optional calculation settings.
 * @returns Age metrics ordered by file path.
 */
export function analyseAge(
  files: readonly FileBlame[],
  options: AgeOptions = {},
): AgeMetric[] {
  const now = options.now ?? Date.now();

  return files
    .map((file) => buildAgeMetric(file, now))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function buildAgeMetric(file: FileBlame, now: number): AgeMetric {
  const ages = file.lines.map((line) => daysBetween(now, line.timestamp)).sort((left, right) => left - right);

  return {
    filePath: file.filePath,
    medianLineAgeDays: median(ages),
    oldestLineAgeDays: ages.at(-1) ?? 0,
    newestLineAgeDays: ages[0] ?? 0,
    ageDistribution: bucketAges(ages),
    stableZones: findStableZones(file.lines, now),
  };
}

function bucketAges(ages: readonly number[]): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { label: "0-7d", minDays: 0, maxDays: 7, lineCount: 0 },
    { label: "7-30d", minDays: 7, maxDays: 30, lineCount: 0 },
    { label: "30-90d", minDays: 30, maxDays: 90, lineCount: 0 },
    { label: "90d+", minDays: 90, lineCount: 0 },
  ];

  for (const age of ages) {
    if (age < 7) {
      buckets[0]!.lineCount += 1;
    } else if (age < 30) {
      buckets[1]!.lineCount += 1;
    } else if (age < 90) {
      buckets[2]!.lineCount += 1;
    } else {
      buckets[3]!.lineCount += 1;
    }
  }

  return buckets;
}

function findStableZones(lines: FileBlame["lines"], now: number): LineRange[] {
  const sorted = [...lines].sort((left, right) => left.lineNumber - right.lineNumber);
  const ranges: LineRange[] = [];
  let startIndex = -1;
  let ages: number[] = [];

  for (const [index, line] of sorted.entries()) {
    const ageDays = daysBetween(now, line.timestamp);

    if (ageDays > STABLE_ZONE_DAYS) {
      if (startIndex === -1) {
        startIndex = index;
      }

      ages.push(ageDays);
      continue;
    }

    if (startIndex !== -1) {
      ranges.push({
        startLine: sorted[startIndex]?.lineNumber ?? 0,
        endLine: sorted[index - 1]?.lineNumber ?? sorted[startIndex]?.lineNumber ?? 0,
        ageDays: median(ages),
      });
      startIndex = -1;
      ages = [];
    }
  }

  if (startIndex !== -1) {
    ranges.push({
      startLine: sorted[startIndex]?.lineNumber ?? 0,
      endLine: sorted.at(-1)?.lineNumber ?? sorted[startIndex]?.lineNumber ?? 0,
      ageDays: median(ages),
    });
  }

  return ranges;
}

function daysBetween(later: number, earlier: number): number {
  return Math.max(0, (later - earlier) / DAY_MS);
}
