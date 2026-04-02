import { describe, expect, test } from "vitest";

import { analyseRepository } from "../../packages/core/src/aggregator.ts";
import { startReportServer } from "../../packages/cli/src/server.ts";
import {
  createTempDir,
  ensureFixtureRepos,
  fixtureRepoPath,
} from "../support/fixtures.ts";

describe("report server", () => {
  test("serves the dashboard shell from the root route", async () => {
    ensureFixtureRepos();

    const outDir = await createTempDir("strata-server-");
    const analysis = await analyseRepository(fixtureRepoPath("simple"), {
      outDir,
      cache: false,
      browser: false,
      format: "json",
    });

    const server = await startReportServer(analysis.outputDir, 0);

    try {
      const response = await fetch(`${server.url}/`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("<!doctype html>");
    } finally {
      await server.close();
    }
  });
});
