import { spawn } from "node:child_process";
import path from "node:path";

import { createCacheKey, readCache, writeCache } from "../cache.js";
import { normalizeRepoPath } from "../utils.js";

export interface GitContext {
  repoRoot: string;
  headSha: string;
  cacheDir: string;
}

export interface GitLogQuery {
  since?: string;
  maxCount?: number;
  filePath?: string;
  revRange?: string;
  follow?: boolean;
}

export interface GitCommitFileStat {
  filePath: string;
  additions: number;
  deletions: number;
}

export interface GitCommitSnapshotEntry {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  timestamp: number;
  date: string;
  message: string;
  subject: string;
  parents: string[];
  filesChanged: string[];
  insertions: number;
  deletions: number;
  isMerge: boolean;
  fileStats: GitCommitFileStat[];
}

export interface GitCommitSnapshot {
  commits: GitCommitSnapshotEntry[];
  statsBySha: Map<string, GitCommitFileStat[]>;
}

const inFlightSnapshots = new Map<string, Promise<GitCommitSnapshot>>();

class GitCommandError extends Error {
  public readonly command: string;
  public readonly code: number | null;
  public readonly stderr: string;

  constructor(command: string, code: number | null, stderr: string) {
    super(
      stderr.trim()
        ? `git ${command} failed with code ${code ?? "unknown"}: ${stderr.trim()}`
        : `git ${command} failed with code ${code ?? "unknown"}`,
    );
    this.name = "GitCommandError";
    this.command = command;
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Resolves a repository path to its Git root, HEAD SHA, and cache directory.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @returns The normalized repository context used by git-engine calls.
 */
export async function getGitContext(repoPath: string): Promise<GitContext> {
  const absolutePath = path.resolve(repoPath);
  const [repoRootRaw, headShaRaw] = await Promise.all([
    runGit(absolutePath, ["rev-parse", "--show-toplevel"]),
    runGit(absolutePath, ["rev-parse", "HEAD"]),
  ]);

  const repoRoot = repoRootRaw.trim();
  const headSha = headShaRaw.trim();

  if (!repoRoot || !headSha) {
    throw new Error(`Unable to resolve Git context for ${repoPath}`);
  }

  return {
    repoRoot,
    headSha,
    cacheDir: path.join(repoRoot, ".strata", "cache"),
  };
}

/**
 * Executes a git command inside the provided repository root.
 *
 * @param repoRoot The absolute repository root used as the working directory.
 * @param args The git arguments excluding the `git` binary itself.
 * @returns The raw standard output from git.
 */
export async function runGit(repoRoot: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (!child.stdout || !child.stderr) {
      reject(new Error("Unable to start git process"));
      return;
    }

    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk: string) => {
      stderr.push(chunk);
    });

    child.once("error", (error: Error) => {
      reject(error);
    });

    child.once("close", (code: number | null) => {
      if (code === 0) {
        resolve(stdout.join(""));
        return;
      }

      reject(new GitCommandError(args.join(" "), code, stderr.join("")));
    });
  });
}

/**
 * Reads a cache entry using the repository HEAD SHA as part of the key.
 *
 * @param context The resolved repository context.
 * @param scope The logical cache namespace, usually a git function name.
 * @param args The arguments that affect the cache entry.
 * @returns The cached value when present, otherwise `undefined`.
 */
export async function readGitCache<T>(
  context: GitContext,
  scope: string,
  args: readonly unknown[],
): Promise<T | undefined> {
  const key = createCacheKey(context.repoRoot, context.headSha, scope, args);
  return readCache<T>(context.cacheDir, key);
}

/**
 * Writes a cache entry scoped to the repository HEAD SHA.
 *
 * @param context The resolved repository context.
 * @param scope The logical cache namespace, usually a git function name.
 * @param args The arguments that affect the cache entry.
 * @param value The serialisable payload to persist.
 * @returns A promise that resolves when the cache entry has been written.
 */
export async function writeGitCache<T>(
  context: GitContext,
  scope: string,
  args: readonly unknown[],
  value: T,
): Promise<void> {
  const key = createCacheKey(context.repoRoot, context.headSha, scope, args);
  await writeCache(context.cacheDir, key, value);
}

/**
 * Converts a repository path into a stable POSIX-relative path.
 *
 * @param repoRoot The absolute repository root.
 * @param filePath The absolute or relative file path to normalise.
 * @returns A repository-relative path using forward slashes.
 */
export function normalizeGitPath(repoRoot: string, filePath: string): string {
  const relativePath = normalizeRepoPath(repoRoot, filePath);
  return relativePath.replace(/^\.\//, "");
}

/**
 * Runs `git ls-files` and returns all tracked files as repository-relative
 * paths.
 *
 * @param repoRoot The absolute repository root.
 * @returns The tracked file list in git order.
 */
export async function listTrackedFiles(repoRoot: string): Promise<string[]> {
  const raw = await runGit(repoRoot, ["ls-files", "-z"]);
  return raw
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => entry);
}

/**
 * Loads a cacheable git history snapshot for a log query.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param query The git log constraints to apply.
 * @returns Parsed commit metadata and per-commit file stats.
 */
export async function loadCommitSnapshots(
  repoPath: string,
  query: GitLogQuery = {},
): Promise<GitCommitSnapshot> {
  if (query.maxCount === 0) {
    return {
      commits: [],
      statsBySha: new Map<string, GitCommitFileStat[]>(),
    };
  }

  const context = await getGitContext(repoPath);
  const normalizedFilePath = query.filePath
    ? normalizeGitPath(context.repoRoot, query.filePath)
    : undefined;
  const commandQuery: GitLogQuery = {};

  if (query.since !== undefined) {
    commandQuery.since = query.since;
  }

  if (query.maxCount !== undefined) {
    commandQuery.maxCount = query.maxCount;
  }

  if (query.revRange !== undefined) {
    commandQuery.revRange = query.revRange;
  }

  if (query.follow !== undefined) {
    commandQuery.follow = query.follow;
  }

  if (normalizedFilePath !== undefined) {
    commandQuery.filePath = normalizedFilePath;
  }

  const cacheArgs = [
    query.revRange ?? "",
    query.since ?? "",
    query.maxCount ?? null,
    normalizedFilePath ?? "",
    query.follow ?? Boolean(query.filePath),
  ] as const;
  const cacheKey = createCacheKey(
    context.repoRoot,
    context.headSha,
    "git/log-snapshots",
    cacheArgs,
  );

  const inFlight = inFlightSnapshots.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const loading = (async (): Promise<GitCommitSnapshot> => {
    try {
      const cached = await readGitCache<GitCommitSnapshotEntry[]>(
        context,
        "git/log-snapshots",
        cacheArgs,
      );

      if (cached) {
        return {
          commits: cached,
          statsBySha: buildStatsIndex(cached),
        };
      }

      const [metaOutput, statsOutput] = await Promise.all([
        runCommitMetaLog(context.repoRoot, commandQuery),
        runCommitStatsLog(context.repoRoot, commandQuery),
      ]);

      const commits = mergeCommitSnapshots(
        parseCommitMetaLog(metaOutput),
        parseCommitStatsLog(statsOutput),
      );
      await writeGitCache(context, "git/log-snapshots", cacheArgs, commits);

      return {
        commits,
        statsBySha: buildStatsIndex(commits),
      };
    } finally {
      inFlightSnapshots.delete(cacheKey);
    }
  })();

  inFlightSnapshots.set(cacheKey, loading);
  return loading;
}

/**
 * Runs a git command and returns the output split into lines.
 *
 * @param repoRoot The repository root used as the git working directory.
 * @param args The git arguments.
 * @returns The command output lines.
 */
export async function runGitLines(
  repoRoot: string,
  args: readonly string[],
): Promise<string[]> {
  const raw = await runGit(repoRoot, args);
  return raw.split(/\r?\n/);
}

/**
 * Limits the number of concurrently running promise-producing tasks.
 *
 * @param items The source items to map.
 * @param concurrency The maximum number of concurrent tasks.
 * @param mapper The async mapping function.
 * @returns The mapped results in input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function runCommitMetaLog(repoRoot: string, query: GitLogQuery): Promise<string> {
  const args = buildLogArgs([
    "log",
    "--date=iso-strict",
    "--format=%H%x00%h%x00%an%x00%ae%x00%at%x00%ad%x00%P%x00%s%x00%B%x00",
  ], query);
  return runGit(repoRoot, args);
}

function runCommitStatsLog(repoRoot: string, query: GitLogQuery): Promise<string> {
  const args = buildLogArgs(["log", "--format=%H", "--numstat", "--no-renames"], query);
  return runGit(repoRoot, args);
}

function buildLogArgs(
  baseArgs: string[],
  query: GitLogQuery,
): string[] {
  const args = [...baseArgs];

  if (query.since) {
    args.push(`--since=${query.since}`);
  }

  if (query.maxCount !== undefined) {
    args.push(`--max-count=${query.maxCount}`);
  }

  if (query.revRange) {
    args.push(query.revRange);
  }

  if (query.filePath) {
    if (query.follow ?? true) {
      args.push("--follow");
    }

    args.push("--", query.filePath);
  }

  return args;
}

function parseCommitMetaLog(raw: string): GitCommitSnapshotEntry[] {
  const fields = raw.split("\0");
  if (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  const records: GitCommitSnapshotEntry[] = [];

  for (let index = 0; index + 8 < fields.length; index += 9) {
    const sha = fields[index]!;
    const shortSha = fields[index + 1]!;
    const author = fields[index + 2]!;
    const email = fields[index + 3]!;
    const timestamp = Number(fields[index + 4]!) * 1000;
    const date = fields[index + 5]!;
    const parents = fields[index + 6]!.trim().length > 0
      ? fields[index + 6]!.trim().split(/\s+/)
      : [];
    const subject = fields[index + 7]!;
    const message = stripTrailingLineBreak(fields[index + 8]!);

    records.push({
      sha,
      shortSha,
      author,
      email,
      timestamp,
      date,
      message,
      subject,
      parents,
      filesChanged: [],
      insertions: 0,
      deletions: 0,
      isMerge: parents.length > 1,
      fileStats: [],
    });
  }

  return records;
}

function parseCommitStatsLog(raw: string): Map<string, GitCommitFileStat[]> {
  const statsBySha = new Map<string, GitCommitFileStat[]>();
  const lines = raw.split(/\r?\n/);
  let currentSha: string | undefined;

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (/^[0-9a-f]{40}$/.test(line)) {
      currentSha = line;
      if (!statsBySha.has(line)) {
        statsBySha.set(line, []);
      }
      continue;
    }

    if (!currentSha) {
      continue;
    }

    const parsed = parseNumstatLine(line);
    if (!parsed) {
      continue;
    }

    statsBySha.get(currentSha)!.push(parsed);
  }

  return statsBySha;
}

function mergeCommitSnapshots(
  commits: GitCommitSnapshotEntry[],
  statsBySha: Map<string, GitCommitFileStat[]>,
): GitCommitSnapshotEntry[] {
  return commits.map((commit) => {
    const fileStats = statsBySha.get(commit.sha) ?? [];
    const filesChanged = Array.from(
      new Set(fileStats.map((entry) => entry.filePath)),
    );
    const insertions = fileStats.reduce((sum, entry) => sum + entry.additions, 0);
    const deletions = fileStats.reduce((sum, entry) => sum + entry.deletions, 0);

    return {
      ...commit,
      filesChanged,
      insertions,
      deletions,
      fileStats,
    };
  });
}

function buildStatsIndex(
  commits: readonly GitCommitSnapshotEntry[],
): Map<string, GitCommitFileStat[]> {
  return new Map(commits.map((commit) => [commit.sha, commit.fileStats]));
}

function parseNumstatLine(line: string): GitCommitFileStat | undefined {
  const parts = line.split("\t");
  if (parts.length < 3) {
    return undefined;
  }

  const additions = parseNumstatCount(parts[0]!);
  const deletions = parseNumstatCount(parts[1]!);
  const filePath = parts.slice(2).join("\t");

  return {
    filePath,
    additions,
    deletions,
  };
}

function parseNumstatCount(raw: string): number {
  if (raw === "-") {
    return 0;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function stripTrailingLineBreak(value: string): string {
  return value.replace(/\r?\n$/, "");
}
