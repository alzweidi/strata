import path from "node:path";

import type {
  Commit,
  MetricDiffReport,
  StrataConfig,
} from "@strata/core";

import { normalizeRepoPath } from "@strata/core";

import { resolveAbsolutePath } from "./utils.js";
import {
  buildAuthorLastActive,
  buildTouchStats,
  compareCommits as compareCommitsInternal,
  listTrackedFiles,
  readCommitHistory as readCommitHistoryInternal,
  readFileTexts,
  runGit,
} from "./git/internal.js";

export interface RepositoryHead {
  repoPath: string;
  repoName: string;
  headSha: string;
  headDate: string;
}

export interface FileTouchStats {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  firstSeen: number;
  lastChanged: number;
  authorCounts: Map<string, number>;
  authorEmails: Map<string, string>;
}

export interface RepositorySnapshot extends RepositoryHead {
  trackedFiles: string[];
  commits: Commit[];
  fileTexts: Map<string, string>;
  touchStats: Map<string, FileTouchStats>;
  authorLastActive: Map<string, number>;
}

/**
 * Resolves a repository path to the git work tree root.
 *
 * @param repoPath The input repository path.
 * @returns The absolute git root path.
 */
export async function resolveRepositoryRoot(repoPath: string): Promise<string> {
  const absolutePath = resolveAbsolutePath(repoPath, process.cwd());
  const stdout = await runGit(absolutePath, ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

/**
 * Verifies that the supplied path is inside a git repository.
 *
 * @param repoPath The candidate repository path.
 * @returns Nothing.
 */
export async function assertGitRepository(repoPath: string): Promise<void> {
  await runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);
}

/**
 * Collects the raw repository snapshot needed for report generation.
 *
 * @param repoPath The repository root to inspect.
 * @param config The active CLI configuration.
 * @returns A snapshot of git history, tracked files, and file contents.
 */
export async function collectRepositorySnapshot(
  repoPath: string,
  config: Pick<StrataConfig, "since" | "allRefs" | "ignore" | "concurrency">,
): Promise<RepositorySnapshot> {
  const head = await readRepositoryHead(repoPath);
  const trackedFiles = await listTrackedFiles(head.repoPath, config.ignore);
  const commits = await readCommitHistory(head.repoPath, config.since, config.allRefs);
  return {
    ...head,
    trackedFiles,
    commits,
    fileTexts: await readFileTexts(head.repoPath, trackedFiles, config.concurrency),
    touchStats: buildTouchStats(commits),
    authorLastActive: buildAuthorLastActive(commits),
  };
}

/**
 * Reads the repository HEAD information required for cache keying.
 *
 * @param repoPath The repository root to inspect.
 * @returns The git root and current HEAD metadata.
 */
export async function readRepositoryHead(repoPath: string): Promise<RepositoryHead> {
  const rootPath = await resolveRepositoryRoot(repoPath);
  const [headSha, headDate] = await Promise.all([
    runGit(rootPath, ["rev-parse", "HEAD"]).then((value) => value.trim()),
    runGit(rootPath, ["show", "-s", "--format=%cI", "HEAD"]).then((value) => value.trim()),
  ]);

  return {
    repoPath: rootPath,
    repoName: path.basename(rootPath),
    headSha,
    headDate,
  };
}

/**
 * Reads the repository commit history in reverse chronological order.
 *
 * @param repoPath The repository root to inspect.
 * @param since Optional lower bound for commit timestamps.
 * @returns Commit history records.
 */
export async function readCommitHistory(
  repoPath: string,
  since?: string,
  allRefs: boolean = false,
): Promise<Commit[]> {
  return readCommitHistoryInternal(repoPath, since, allRefs);
}

/**
 * Computes a coarse commit diff report between two SHAs.
 *
 * @param repoPath The repository root to inspect.
 * @param fromSha The base commit SHA.
 * @param toSha The target commit SHA.
 * @returns A diff report with file-level deltas.
 */
export async function compareCommits(
  repoPath: string,
  fromSha: string,
  toSha: string,
): Promise<MetricDiffReport> {
  return await compareCommitsInternal(repoPath, fromSha, toSha);
}

/**
 * Normalizes a repository path to POSIX format.
 *
 * @param repoPath The repository root.
 * @param filePath The file path to normalize.
 * @returns A stable repository-relative path.
 */
export function normalizeTrackedPath(repoPath: string, filePath: string): string {
  return normalizeRepoPath(repoPath, filePath);
}
