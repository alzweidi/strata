import type { Commit, LogOptions } from "../types.js";

import {
  getGitContext,
  loadCommitSnapshots,
  runGitLines,
  type GitCommitSnapshotEntry,
  type GitLogQuery,
} from "./_shared.js";

/**
 * Returns the repository commit history in reverse chronological order.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param options Optional log filters such as date bounds or a file path.
 * @returns The ordered commit history with aggregated file and line statistics.
 */
export async function getCommitHistory(
  repoPath: string,
  options: LogOptions = {},
): Promise<Commit[]> {
  const query: GitLogQuery = {};

  if (options.since !== undefined) {
    query.since = options.since;
  }

  if (options.maxCount !== undefined) {
    query.maxCount = options.maxCount;
  }

  if (options.filePath !== undefined) {
    query.filePath = options.filePath;
  }

  if (options.allRefs !== undefined) {
    query.allRefs = options.allRefs;
  }

  const snapshots = await loadCommitHistory(repoPath, query);

  return snapshots.map(toCommit);
}

/**
 * Returns commits between two revisions, excluding the starting revision.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param fromSha The lower-bound revision, excluded from the results.
 * @param toSha The upper-bound revision, included in the results.
 * @returns The ordered commit history between the two revisions.
 */
export async function getCommitsBetween(
  repoPath: string,
  fromSha: string,
  toSha: string,
): Promise<Commit[]> {
  const snapshots = await loadCommitHistory(repoPath, {
    revRange: `${fromSha}..${toSha}`,
  });

  return snapshots.map(toCommit);
}

/**
 * Returns the repository's first commit.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @returns The oldest reachable commit in the repository.
 */
export async function getFirstCommit(repoPath: string): Promise<Commit> {
  const context = await getGitContext(repoPath);
  const rootShas = await runGitLines(context.repoRoot, [
    "rev-list",
    "--max-parents=0",
    "--reverse",
    "HEAD",
  ]);
  const rootSha = rootShas.find((line) => line.trim().length > 0)?.trim();

  if (!rootSha) {
    throw new Error("Unable to determine the repository root commit");
  }

  const snapshots = await loadCommitHistory(repoPath, {
    maxCount: 1,
    revRange: rootSha,
  });

  const firstCommit = snapshots[0];
  if (!firstCommit) {
    throw new Error("Unable to resolve the first commit in the repository");
  }

  return toCommit(firstCommit);
}

/**
 * Returns the commit history for a specific file, following renames.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param filePath The repository-relative or absolute file path to inspect.
 * @returns The ordered commit history for the file.
 */
export async function getCommitsForFile(
  repoPath: string,
  filePath: string,
): Promise<Commit[]> {
  const snapshots = await loadCommitHistory(repoPath, {
    filePath,
    follow: true,
  });

  return snapshots.map(toCommit);
}

async function loadCommitHistory(
  repoPath: string,
  query: GitLogQuery,
): Promise<GitCommitSnapshotEntry[]> {
  const snapshots = await loadCommitSnapshots(repoPath, query);
  return snapshots.commits;
}

function toCommit(entry: GitCommitSnapshotEntry): Commit {
  return {
    sha: entry.sha,
    shortSha: entry.shortSha,
    author: entry.author,
    email: entry.email,
    timestamp: entry.timestamp,
    date: entry.date,
    message: entry.message,
    subject: entry.subject,
    filesChanged: [...entry.filesChanged],
    insertions: entry.insertions,
    deletions: entry.deletions,
    fileStats: entry.fileStats.map((fileStat) => ({
      filePath: fileStat.filePath,
      insertions: fileStat.additions,
      deletions: fileStat.deletions,
    })),
    isMerge: entry.isMerge,
  };
}
