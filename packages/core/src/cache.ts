import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Produces a stable SHA-256 cache key for a repository artifact.
 *
 * @param repoPath The repository being analysed.
 * @param headSha The HEAD commit SHA used to scope cache validity.
 * @param scope The analyser or git module name.
 * @param args Additional arguments that affect the cache entry.
 * @returns The content-addressed cache key.
 */
export function createCacheKey(
  repoPath: string,
  headSha: string,
  scope: string,
  args: readonly unknown[] = [],
): string {
  const payload = JSON.stringify({ repoPath, headSha, scope, args });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Reads a gzipped JSON cache entry if it exists.
 *
 * @param cacheDir The cache directory root.
 * @param key The cache key to load.
 * @returns The parsed entry or `undefined` when missing.
 */
export async function readCache<T>(
  cacheDir: string,
  key: string,
): Promise<T | undefined> {
  const filePath = cacheFilePath(cacheDir, key);

  try {
    const compressed = await readFile(filePath);
    const raw = await gunzipAsync(compressed);
    return JSON.parse(raw.toString("utf8")) as T;
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }

    throw error;
  }
}

/**
 * Writes a gzipped JSON cache entry to disk.
 *
 * @param cacheDir The cache directory root.
 * @param key The cache key to write.
 * @param value The serializable payload to persist.
 * @returns The written cache file path.
 */
export async function writeCache<T>(
  cacheDir: string,
  key: string,
  value: T,
): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const filePath = cacheFilePath(cacheDir, key);
  const compressed = await gzipAsync(JSON.stringify(value));
  await writeFile(filePath, compressed);
  return filePath;
}

/**
 * Removes an entire output directory, including cached analysis artifacts.
 *
 * @param outputDir The output directory to delete.
 * @returns A promise that resolves when deletion completes.
 */
export async function clearOutputDirectory(outputDir: string): Promise<void> {
  await rm(outputDir, { recursive: true, force: true });
}

function cacheFilePath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.json.gz`);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

