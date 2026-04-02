import { describe, expect, test } from "vitest";

import type { Commit } from "../../packages/core/src/types.ts";
import { buildTouchStats } from "../../packages/cli/src/git/internal.ts";

describe("touch stats", () => {
  test("uses per-file insertions and deletions instead of duplicating commit totals", () => {
    const commits: Commit[] = [
      {
        sha: "a".repeat(40),
        shortSha: "aaaaaaa",
        author: "Ada",
        email: "ada@example.com",
        timestamp: Date.UTC(2026, 0, 1),
        date: "2026-01-01T00:00:00.000Z",
        message: "Update two files",
        subject: "Update two files",
        filesChanged: ["src/a.ts", "src/b.ts"],
        insertions: 12,
        deletions: 3,
        fileStats: [
          { filePath: "src/a.ts", insertions: 10, deletions: 2 },
          { filePath: "src/b.ts", insertions: 2, deletions: 1 },
        ],
        isMerge: false,
      },
    ];

    const stats = buildTouchStats(commits);

    expect(stats.get("src/a.ts")).toMatchObject({
      totalInsertions: 10,
      totalDeletions: 2,
      totalCommits: 1,
    });
    expect(stats.get("src/b.ts")).toMatchObject({
      totalInsertions: 2,
      totalDeletions: 1,
      totalCommits: 1,
    });
  });
});
