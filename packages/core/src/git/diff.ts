import type { ChurnSeries, FileChurn, FileDiff, Granularity } from "../types.js";

import {
  getGitContext,
  loadCommitSnapshots,
  readGitCache,
  runGit,
  writeGitCache,
  type GitCommitFileStat,
  type GitCommitSnapshotEntry,
} from "./_shared.js";

/**
 * Returns per-file churn statistics derived from commit history.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @returns A map of repository-relative file paths to churn metrics.
 */
export async function getFileChurn(repoPath: string): Promise<Map<string, FileChurn>> {
  const context = await getGitContext(repoPath);
  const cached = await readGitCache<Array<[string, FileChurn]>>(
    context,
    "git/file-churn",
    [],
  );

  if (cached) {
    return new Map(cached);
  }

  const snapshots = await loadCommitSnapshots(repoPath, {});
  const churnByFile = buildFileChurn(snapshots.commits, snapshots.statsBySha);
  const serialisable = [...churnByFile.entries()];
  await writeGitCache(context, "git/file-churn", [], serialisable);
  return churnByFile;
}

/**
 * Returns file-level diff stats for a specific commit.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param sha The commit SHA to inspect.
 * @returns The file-level additions, deletions, and change status for the commit.
 */
export async function getDiffForCommit(
  repoPath: string,
  sha: string,
): Promise<FileDiff[]> {
  const context = await getGitContext(repoPath);
  const cached = await readGitCache<FileDiff[]>(context, "git/commit-diff", [sha]);

  if (cached) {
    return cached;
  }

  const [numstatRaw, statusRaw] = await Promise.all([
    runGit(context.repoRoot, [
      "show",
      "--format=",
      "--numstat",
      "--find-renames=50%",
      sha,
    ]),
    runGit(context.repoRoot, [
      "show",
      "--format=",
      "--name-status",
      "--find-renames=50%",
      sha,
    ]),
  ]);

  const value = mergeDiffOutputs(parseNumstatOutput(numstatRaw), parseStatusOutput(statusRaw));
  await writeGitCache(context, "git/commit-diff", [sha], value);
  return value;
}

/**
 * Returns churn metrics bucketed by day, week, or month.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param granularity The time bucket size for aggregation.
 * @returns A chronological churn time series.
 */
export async function getChurnOverTime(
  repoPath: string,
  granularity: Granularity,
): Promise<ChurnSeries[]> {
  const context = await getGitContext(repoPath);
  const cached = await readGitCache<ChurnSeries[]>(
    context,
    "git/churn-over-time",
    [granularity],
  );

  if (cached) {
    return cached;
  }

  const snapshots = await loadCommitSnapshots(repoPath, {});
  const value = buildChurnSeries(snapshots.commits, snapshots.statsBySha, granularity);
  await writeGitCache(context, "git/churn-over-time", [granularity], value);
  return value;
}

function buildFileChurn(
  commits: readonly GitCommitSnapshotEntry[],
  statsBySha: Map<string, GitCommitFileStat[]>,
): Map<string, FileChurn> {
  const perFile = new Map<
    string,
    {
      totalCommits: number;
      totalInsertions: number;
      totalDeletions: number;
      firstSeen: number;
      lastChanged: number;
    }
  >();

  for (const commit of commits) {
    const stats = statsBySha.get(commit.sha) ?? [];
    const touchedFiles = new Set(stats.map((entry) => entry.filePath));

    for (const filePath of touchedFiles) {
      const current = perFile.get(filePath) ?? {
        totalCommits: 0,
        totalInsertions: 0,
        totalDeletions: 0,
        firstSeen: commit.timestamp,
        lastChanged: commit.timestamp,
      };

      current.totalCommits += 1;
      current.firstSeen = Math.min(current.firstSeen, commit.timestamp);
      current.lastChanged = Math.max(current.lastChanged, commit.timestamp);

      for (const entry of stats) {
        if (entry.filePath !== filePath) {
          continue;
        }

        current.totalInsertions += entry.additions;
        current.totalDeletions += entry.deletions;
      }

      perFile.set(filePath, current);
    }
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const value = [...perFile.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, entry]) => {
      const elapsedWeeks = Math.max((Date.now() - entry.firstSeen) / weekMs, 1);
      const churnScore = entry.totalInsertions + entry.totalDeletions;

      return [
        filePath,
        {
          filePath,
          totalCommits: entry.totalCommits,
          totalInsertions: entry.totalInsertions,
          totalDeletions: entry.totalDeletions,
          churnScore,
          changeFrequency: entry.totalCommits / elapsedWeeks,
          firstSeen: entry.firstSeen,
          lastChanged: entry.lastChanged,
        },
      ] as const;
    });

  return new Map(value);
}

function buildChurnSeries(
  commits: readonly GitCommitSnapshotEntry[],
  statsBySha: Map<string, GitCommitFileStat[]>,
  granularity: Granularity,
): ChurnSeries[] {
  const buckets = new Map<string, { insertions: number; deletions: number; files: Set<string> }>();

  for (const commit of commits) {
    const bucket = formatBucket(commit.timestamp, granularity);
    const current = buckets.get(bucket) ?? {
      insertions: 0,
      deletions: 0,
      files: new Set<string>(),
    };
    const stats = statsBySha.get(commit.sha) ?? [];

    for (const entry of stats) {
      current.insertions += entry.additions;
      current.deletions += entry.deletions;
      current.files.add(entry.filePath);
    }

    buckets.set(bucket, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, entry]) => ({
      period,
      totalInsertions: entry.insertions,
      totalDeletions: entry.deletions,
      churnScore: entry.insertions + entry.deletions,
      fileCount: entry.files.size,
    }));
}

function mergeDiffOutputs(
  numstatEntries: DiffStatEntry[],
  statusEntries: DiffStatusEntry[],
): FileDiff[] {
  const length = Math.max(numstatEntries.length, statusEntries.length);
  const diffs: FileDiff[] = [];

  for (let index = 0; index < length; index += 1) {
    const numstat = numstatEntries[index];
    const status = statusEntries[index];

    if (!numstat && !status) {
      continue;
    }

    const statusName = status?.status ?? inferStatusFromPaths(numstat);
    const filePath = status?.filePath ?? numstat?.filePath ?? "";
    const previousPath = status?.previousPath ?? numstat?.previousPath;

    const diff: FileDiff = {
      filePath,
      additions: numstat?.additions ?? 0,
      deletions: numstat?.deletions ?? 0,
      status: statusName,
    };

    if (previousPath !== undefined) {
      diff.previousPath = previousPath;
    }

    diffs.push(diff);
  }

  return diffs;
}

function parseNumstatOutput(raw: string): DiffStatEntry[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      const pathField = pathParts.join("\t");
      const [previousPath, filePath] = splitRenamePath(pathField);

      const entry: DiffStatEntry = {
        additions: parseCount(additionsRaw ?? "0"),
        deletions: parseCount(deletionsRaw ?? "0"),
        filePath: filePath ?? pathField,
      };

      if (previousPath !== undefined) {
        entry.previousPath = previousPath;
      }

      return entry;
    });
}

function parseStatusOutput(raw: string): DiffStatusEntry[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      const statusCode = parts[0] ?? "";

      if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
        return {
          status: "renamed" as const,
          previousPath: parts[1] ?? "",
          filePath: parts[2] ?? parts[1] ?? "",
        };
      }

      return {
        status: statusCode === "A"
          ? ("added" as const)
          : statusCode === "D"
            ? ("deleted" as const)
            : ("modified" as const),
        filePath: parts[1] ?? "",
      };
    });
}

function inferStatusFromPaths(stat: DiffStatEntry | undefined): FileDiff["status"] {
  if (!stat) {
    return "modified";
  }

  if (stat.previousPath && stat.previousPath !== stat.filePath) {
    return "renamed";
  }

  return "modified";
}

function splitRenamePath(pathField: string): [string | undefined, string | undefined] {
  if (!pathField.includes(" => ")) {
    return [undefined, pathField || undefined];
  }

  const [left, right] = pathField.split(" => ");
  return [left || undefined, right || undefined];
}

function parseCount(raw: string): number {
  if (raw === "-") {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBucket(timestamp: number, granularity: Granularity): string {
  const date = new Date(timestamp);

  if (granularity === "day") {
    return date.toISOString().slice(0, 10);
  }

  if (granularity === "month") {
    return date.toISOString().slice(0, 7);
  }

  const utcDay = date.getUTCDay();
  const offset = utcDay === 0 ? -6 : 1 - utcDay;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() + offset);
  return start.toISOString().slice(0, 10);
}

interface DiffStatEntry {
  additions: number;
  deletions: number;
  filePath: string;
  previousPath?: string;
}

interface DiffStatusEntry {
  filePath: string;
  previousPath?: string;
  status: FileDiff["status"];
}
