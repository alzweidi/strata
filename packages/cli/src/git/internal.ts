import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  Commit,
  MetricDiffEntry,
  StrataConfig,
} from "@strata/core";

import { normalizeRepoPath } from "@strata/core";

import { toPosixPath } from "../utils.js";
import type { FileTouchStats } from "../git.js";

const execFileAsync = promisify(execFile);

/**
 * Executes a git command and returns stdout as text.
 *
 * @param repoPath The working tree root.
 * @param args Git arguments to execute.
 * @returns Standard output as UTF-8 text.
 */
export async function runGit(repoPath: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: repoPath,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Lists tracked files, applies ignore filters, and returns normalized paths.
 *
 * @param repoPath The repository root.
 * @param ignorePatterns Glob patterns to ignore.
 * @returns Repository-relative tracked file paths.
 */
export async function listTrackedFiles(
  repoPath: string,
  ignorePatterns: readonly string[],
): Promise<string[]> {
  const output = await runGit(repoPath, ["ls-files", "-z"]);
  const ignore = createIgnorePredicate(ignorePatterns);
  return output
    .split("\0")
    .filter(Boolean)
    .map((filePath) => normalizeRepoPath(repoPath, filePath))
    .filter((filePath) => !ignore(filePath));
}

/**
 * Reads file contents for a set of repository-relative paths.
 *
 * @param repoPath The repository root.
 * @param filePaths File paths to read.
 * @param concurrency Maximum parallel reads per batch.
 * @returns A map of file path to file content.
 */
export async function readFileTexts(
  repoPath: string,
  filePaths: readonly string[],
  concurrency: number,
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  const limit = Math.max(1, concurrency);
  for (let index = 0; index < filePaths.length; index += limit) {
    const batch = filePaths.slice(index, index + limit);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const absolutePath = path.join(repoPath, filePath);
        const text = await readTextFile(absolutePath);
        return [filePath, text] as const;
      }),
    );

    for (const [filePath, text] of results) {
      texts.set(filePath, text);
    }
  }

  return texts;
}

/**
 * Reads the current repository history in reverse chronological order.
 *
 * @param repoPath The repository root.
 * @param since Optional lower bound for commits.
 * @returns Parsed commit records.
 */
export async function readCommitHistory(
  repoPath: string,
  since?: string,
): Promise<Commit[]> {
  const args = [
    "log",
    "--date=iso-strict",
    "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%cI%x1f%s%x1f%b%x1e",
    "--numstat",
    "--no-renames",
  ];

  if (since) {
    args.push(`--since=${since}`);
  }

  return parseCommitLog(await runGit(repoPath, args));
}

/**
 * Computes a coarse diff report between two commits.
 *
 * @param repoPath The repository root.
 * @param fromSha The base commit SHA.
 * @param toSha The target commit SHA.
 * @returns File-level diff entries.
 */
export async function compareCommits(
  repoPath: string,
  fromSha: string,
  toSha: string,
): Promise<{ fromSha: string; toSha: string; entries: MetricDiffEntry[] }> {
  const output = await runGit(repoPath, [
    "diff",
    "--numstat",
    "--find-renames",
    fromSha,
    toSha,
  ]);
  return {
    fromSha,
    toSha,
    entries: parseDiffStat(output),
  };
}

/**
 * Collects last-active timestamps for each author.
 *
 * @param commits Repository commits.
 * @returns A map of author name to timestamp.
 */
export function buildAuthorLastActive(commits: readonly Commit[]): Map<string, number> {
  const lastActive = new Map<string, number>();
  for (const commit of commits) {
    const existing = lastActive.get(commit.author);
    if (existing === undefined || existing < commit.timestamp) {
      lastActive.set(commit.author, commit.timestamp);
    }
  }

  return lastActive;
}

/**
 * Collects per-file touch stats from commit history.
 *
 * @param commits Repository commits.
 * @returns A map of file path to touch stats.
 */
export function buildTouchStats(commits: readonly Commit[]): Map<string, FileTouchStats> {
  const stats = new Map<string, FileTouchStats>();
  for (const commit of commits) {
    for (const filePath of commit.filesChanged) {
      const existing = stats.get(filePath) ?? {
        totalCommits: 0,
        totalInsertions: 0,
        totalDeletions: 0,
        firstSeen: commit.timestamp,
        lastChanged: commit.timestamp,
        authorCounts: new Map<string, number>(),
        authorEmails: new Map<string, string>(),
      };

      existing.totalCommits += 1;
      existing.totalInsertions += commit.insertions;
      existing.totalDeletions += commit.deletions;
      existing.firstSeen = Math.min(existing.firstSeen, commit.timestamp);
      existing.lastChanged = Math.max(existing.lastChanged, commit.timestamp);
      existing.authorCounts.set(
        commit.author,
        (existing.authorCounts.get(commit.author) ?? 0) + 1,
      );
      existing.authorEmails.set(commit.author, commit.email);
      stats.set(filePath, existing);
    }
  }

  return stats;
}

function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").catch(() => "");
}

function parseCommitLog(output: string): Commit[] {
  const blocks = output.split("\x1e").map((block) => block.trim()).filter(Boolean);
  const commits: Commit[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0];
    if (!header) {
      continue;
    }

    const fields = header.split("\x1f");
    if (fields.length < 8) {
      continue;
    }

    const filesChanged = new Map<string, { insertions: number; deletions: number }>();
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parts = trimmed.split("\t");
      if (parts.length < 3) {
        continue;
      }

      const [additionsRaw, deletionsRaw, filePathRaw] = parts as [string, string, string];
      const filePath = toPosixPath(filePathRaw);
      const insertions = parseNumstatValue(additionsRaw);
      const deletions = parseNumstatValue(deletionsRaw);
      const existing = filesChanged.get(filePath) ?? { insertions: 0, deletions: 0 };
      existing.insertions += insertions;
      existing.deletions += deletions;
      filesChanged.set(filePath, existing);
    }

    const sha = fields[0] ?? "";
    const shortSha = fields[1] ?? sha.slice(0, 7);
    const author = fields[2] ?? "Unknown";
    const email = fields[3] ?? "";
    const timestamp = Number.parseInt(fields[4] ?? "0", 10) * 1000;
    const date = fields[5] ?? new Date(timestamp).toISOString();
    const subject = fields[6] ?? "";
    const message = [subject, fields[7] ?? ""].filter(Boolean).join("\n").trim();

    commits.push({
      sha,
      shortSha,
      author,
      email,
      timestamp,
      date,
      message,
      subject,
      filesChanged: Array.from(filesChanged.keys()),
      insertions: Array.from(filesChanged.values()).reduce(
        (sum, entry) => sum + entry.insertions,
        0,
      ),
      deletions: Array.from(filesChanged.values()).reduce(
        (sum, entry) => sum + entry.deletions,
        0,
      ),
      isMerge: /^merge\b/i.test(subject),
    });
  }

  return commits;
}

function parseDiffStat(output: string): MetricDiffEntry[] {
  const entries: MetricDiffEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 3) {
      continue;
    }

      const [additionsRaw, deletionsRaw, filePathRaw] = parts as [string, string, string];
      const additions = parseNumstatValue(additionsRaw);
      const deletions = parseNumstatValue(deletionsRaw);
    entries.push({
      filePath: toPosixPath(filePathRaw),
      locDelta: additions - deletions,
      hotspotDelta: additions - deletions,
      ageDelta: undefined,
      busFactorDelta: undefined,
    });
  }

  entries.sort((left, right) => Math.abs(right.locDelta ?? 0) - Math.abs(left.locDelta ?? 0));
  return entries;
}

function parseNumstatValue(value: string): number {
  if (value === "-" || value === "") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function createIgnorePredicate(patterns: readonly string[]): (value: string) => boolean {
  const matchers = patterns.map((pattern) => globToRegExp(pattern));
  return (value: string) => {
    const basename = path.posix.basename(value);
    return matchers.some((matcher) => matcher.test(value) || matcher.test(basename));
  };
}

function globToRegExp(pattern: string): RegExp {
  const normalized = toPosixPath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(character);
  }

  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
