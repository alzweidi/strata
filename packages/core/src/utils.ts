import path from "node:path";

/**
 * Converts a repository-relative file path into a consistent POSIX form so
 * report output is stable across operating systems.
 *
 * @param repoPath The absolute repository root.
 * @param filePath The absolute or relative file path to normalize.
 * @returns A normalized relative path using `/` separators.
 */
export function normalizeRepoPath(repoPath: string, filePath: string): string {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(repoPath, filePath)
    : filePath;

  return relativePath.split(path.sep).join("/");
}

/**
 * Groups array items by a string key without losing insertion order inside each
 * bucket.
 *
 * @param values The input collection.
 * @param selector The key selector function.
 * @returns A map from key to collected values.
 */
export function groupBy<T>(
  values: readonly T[],
  selector: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = selector(value);
    const existing = groups.get(key);

    if (existing) {
      existing.push(value);
      continue;
    }

    groups.set(key, [value]);
  }

  return groups;
}

/**
 * Clamps a numeric value to a closed range.
 *
 * @param value The raw value.
 * @param min The inclusive lower bound.
 * @param max The inclusive upper bound.
 * @returns The clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculates an arithmetic mean and returns `0` for empty collections.
 *
 * @param values The numbers to average.
 * @returns The mean value or `0`.
 */
export function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Returns the median value for a numeric collection.
 *
 * @param values The numbers to inspect.
 * @returns The median value or `0` when empty.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle]!;
}

