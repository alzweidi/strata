import { runGit } from "./_shared.js";
import {
  getGitContext,
  listTrackedFiles,
  mapWithConcurrency,
  normalizeGitPath,
  readGitCache,
  writeGitCache,
  type GitContext,
} from "./_shared.js";

import type { BlameLine, FileBlame } from "../types.js";

/**
 * Returns line-level blame data for a single file.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param filePath The repository-relative or absolute file path to inspect.
 * @returns Per-line authorship metadata for the file.
 */
export async function getFileBlame(
  repoPath: string,
  filePath: string,
): Promise<FileBlame> {
  const context = await getGitContext(repoPath);
  return loadFileBlame(context, filePath);
}

/**
 * Returns blame data for every tracked file in the repository.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param concurrency The maximum number of concurrent blame processes.
 * @returns A map from file path to blame metadata.
 */
export async function getAllFilesBlame(
  repoPath: string,
  concurrency: number = 4,
): Promise<Map<string, FileBlame>> {
  const context = await getGitContext(repoPath);
  const files = await listTrackedFiles(context.repoRoot);
  const entries = await mapWithConcurrency(files, concurrency, async (filePath) => [
    filePath,
    await loadFileBlame(context, filePath),
  ] as const);

  return new Map(entries);
}

function parseBlameOutput(raw: string): BlameLine[] {
  const lines = raw.split(/\r?\n/);
  const blameLines: BlameLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    if (!header) {
      continue;
    }

    const match = header.match(/^([0-9a-f]{40}) \d+ (\d+) \d+$/);
    if (!match) {
      continue;
    }

    const sha = match[1]!;
    const lineNumber = Number(match[2]);
    let author = "";
    let email = "";
    let timestamp = 0;
    let content = "";

    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }

      if (line.startsWith("\t")) {
        content = line.slice(1);
        break;
      }

      if (line.startsWith("author ")) {
        author = line.slice(7);
      } else if (line.startsWith("author-mail ")) {
        email = stripAngleBrackets(line.slice(12));
      } else if (line.startsWith("author-time ")) {
        timestamp = Number(line.slice(12)) * 1000;
      }
    }

    blameLines.push({
      lineNumber,
      sha,
      author,
      email,
      timestamp,
      content,
    });
  }

  return blameLines;
}

function buildFileBlame(filePath: string, lines: BlameLine[]): FileBlame {
  const uniqueAuthors = new Map<string, { author: string; email: string; lastActive: number }>();
  let lastModified = 0;

  for (const line of lines) {
    lastModified = Math.max(lastModified, line.timestamp);
    const key = `${line.author}\0${line.email}`;
    const existing = uniqueAuthors.get(key);

    if (existing) {
      existing.lastActive = Math.max(existing.lastActive, line.timestamp);
      continue;
    }

    uniqueAuthors.set(key, {
      author: line.author,
      email: line.email,
      lastActive: line.timestamp,
    });
  }

  const authors = [...uniqueAuthors.values()]
    .sort((left, right) => {
      if (left.lastActive !== right.lastActive) {
        return right.lastActive - left.lastActive;
      }

      return left.author.localeCompare(right.author);
    })
    .map((entry) => entry.author);

  return {
    filePath,
    lines,
    uniqueAuthors: authors,
    lastModified,
  };
}

async function loadFileBlame(
  context: GitContext,
  filePath: string,
): Promise<FileBlame> {
  const normalizedPath = normalizeGitPath(context.repoRoot, filePath);
  const cached = await readGitCache<FileBlame>(context, "git/blame", [normalizedPath]);

  if (cached) {
    return cached;
  }

  try {
    const raw = await runGit(context.repoRoot, [
      "blame",
      "--line-porcelain",
      "--",
      normalizedPath,
    ]);
    const lines = parseBlameOutput(raw);
    const value = buildFileBlame(normalizedPath, lines);
    await writeGitCache(context, "git/blame", [normalizedPath], value);
    return value;
  } catch (error) {
    if (isUnsupportedBlameError(error)) {
      const empty = buildFileBlame(normalizedPath, []);
      await writeGitCache(context, "git/blame", [normalizedPath], empty);
      return empty;
    }

    throw error;
  }
}

function stripAngleBrackets(value: string): string {
  return value.replace(/^<|>$/g, "");
}

function isUnsupportedBlameError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = `${error.message}\n${(error as { stderr?: string }).stderr ?? ""}`;
  return /binary file|no such path|not found|cannot blame/i.test(message);
}
