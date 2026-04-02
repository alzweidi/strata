import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { readCommitHistory } from "../../packages/cli/src/git.ts";
import {
  createTempDir,
  ensureFixtureRepos,
  fixtureRepoPath,
} from "../support/fixtures.ts";

describe("history scope", () => {
  test("allRefs includes commits from non-checked-out branches", async () => {
    ensureFixtureRepos();
    const repoPath = await createTempDir("strata-history-scope-");

    execFileSync("git", ["clone", "--quiet", fixtureRepoPath("simple"), repoPath], {
      stdio: "pipe",
    });

    execFileSync("git", ["checkout", "-b", "feature/history"], {
      cwd: repoPath,
      stdio: "pipe",
    });
    await writeFile(path.join(repoPath, "feature.txt"), "branch-only\n", "utf8");
    execFileSync("git", ["add", "feature.txt"], {
      cwd: repoPath,
      stdio: "pipe",
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Strata Test",
        "-c",
        "user.email=strata@example.com",
        "commit",
        "-m",
        "Add feature branch commit",
      ],
      {
        cwd: repoPath,
        stdio: "pipe",
      },
    );
    execFileSync("git", ["checkout", "main"], {
      cwd: repoPath,
      stdio: "pipe",
    });

    const headHistory = await readCommitHistory(repoPath);
    const fullHistory = await readCommitHistory(repoPath, undefined, true);

    expect(fullHistory.length).toBe(headHistory.length + 1);
    expect(fullHistory.some((commit) => commit.subject === "Add feature branch commit")).toBe(true);
    expect(headHistory.some((commit) => commit.subject === "Add feature branch commit")).toBe(
      false,
    );
  });
});
