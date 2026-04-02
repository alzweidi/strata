import type { FileCoupling } from "../types.js";

import {
  getGitContext,
  loadCommitSnapshots,
  readGitCache,
  writeGitCache,
} from "./_shared.js";

/**
 * Returns file-coupling pairs derived from co-change frequency.
 *
 * @param repoPath The repository path or a path inside the repository.
 * @param minCoChanges The minimum number of shared commits required to keep a pair.
 * @returns File pairs sorted by coupling strength and co-change count.
 */
export async function getCommitCoupling(
  repoPath: string,
  minCoChanges: number = 3,
): Promise<FileCoupling[]> {
  const context = await getGitContext(repoPath);
  const threshold = Math.max(0, Math.floor(minCoChanges));
  const cached = await readGitCache<FileCoupling[]>(
    context,
    "git/commit-coupling",
    [threshold],
  );

  if (cached) {
    return cached;
  }

  const snapshots = await loadCommitSnapshots(repoPath, {});
  const value = buildCommitCoupling(snapshots.commits, threshold);
  await writeGitCache(context, "git/commit-coupling", [threshold], value);
  return value;
}

function buildCommitCoupling(
  commits: readonly { filesChanged: string[] }[],
  minCoChanges: number,
): FileCoupling[] {
  const perFile = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const commit of commits) {
    const files = [...new Set(commit.filesChanged)].sort();

    for (const filePath of files) {
      perFile.set(filePath, (perFile.get(filePath) ?? 0) + 1);
    }

    for (let leftIndex = 0; leftIndex < files.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < files.length; rightIndex += 1) {
        const left = files[leftIndex]!;
        const right = files[rightIndex]!;
        const key = pairKey(left, right);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return [...pairCounts.entries()]
    .filter(([, coChangeCount]) => coChangeCount >= minCoChanges)
    .map(([key, coChangeCount]) => {
      const [fileA, fileB] = key.split("\0");
      const totalCommitsA = perFile.get(fileA ?? "") ?? 0;
      const totalCommitsB = perFile.get(fileB ?? "") ?? 0;
      const denominator = Math.min(totalCommitsA, totalCommitsB);

      return {
        fileA: fileA ?? "",
        fileB: fileB ?? "",
        coChangeCount,
        totalCommitsA,
        totalCommitsB,
        couplingStrength: denominator === 0 ? 0 : Math.min(1, coChangeCount / denominator),
      };
    })
    .sort((left, right) => {
      if (right.coChangeCount !== left.coChangeCount) {
        return right.coChangeCount - left.coChangeCount;
      }

      if (right.couplingStrength !== left.couplingStrength) {
        return right.couplingStrength - left.couplingStrength;
      }

      const leftKey = `${left.fileA}\0${left.fileB}`;
      const rightKey = `${right.fileA}\0${right.fileB}`;
      return leftKey.localeCompare(rightKey);
    });
}

function pairKey(fileA: string, fileB: string): string {
  return fileA < fileB ? `${fileA}\0${fileB}` : `${fileB}\0${fileA}`;
}
