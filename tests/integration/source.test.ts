import { access } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { resolveAnalyseSource } from "../../packages/cli/src/source.ts";
import { ensureFixtureRepos, fixtureRepoPath } from "../support/fixtures.ts";

describe("analysis source resolution", () => {
  test("clones a remote file URL into a temporary working directory", async () => {
    ensureFixtureRepos();
    const source = await resolveAnalyseSource(`file://${fixtureRepoPath("simple")}`);

    try {
      expect(source.isRemote).toBe(true);
      expect(source.defaultOutDir).toBe(path.join(process.cwd(), ".strata", "simple"));
      await expect(access(path.join(source.repoPath, ".git"))).resolves.toBeUndefined();
    } finally {
      await source.cleanup();
    }
  });
});
