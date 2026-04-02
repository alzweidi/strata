import path from "node:path";

/**
 * Formats a large number with locale-aware separators.
 *
 * @param value The numeric value to format.
 * @returns A human-readable number string.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

/**
 * Formats a millisecond duration into a compact human-readable string.
 *
 * @param milliseconds The elapsed time in milliseconds.
 * @returns A compact duration string.
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }

  if (milliseconds < 60_000) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }

  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Ensures a value is represented as an absolute filesystem path.
 *
 * @param value The raw path.
 * @param cwd The working directory used for relative paths.
 * @returns An absolute path.
 */
export function resolveAbsolutePath(value: string, cwd: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

/**
 * Converts a path into POSIX separator form for stable report output.
 *
 * @param value The path to normalize.
 * @returns A POSIX-style path string.
 */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

