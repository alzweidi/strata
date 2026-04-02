import { execFileSync } from "node:child_process";
import { cp } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { beforeAll, describe, expect, test } from "vitest";

import { analyseRepository } from "../../packages/core/src/aggregator.ts";
import { getCommitHistory, getFileBlame } from "../../packages/core/src/git/index.ts";
import type { StrataReport } from "../../packages/ui/src/types/report.ts";
import {
  createTempDir,
  ensureFixtureRepos,
  fixtureRepoPath,
  type FixtureName,
} from "../support/fixtures.ts";
import { flattenTree, uniqueHistoryLanguages } from "../support/report.ts";

const fixtureNames: FixtureName[] = ["simple", "team", "large"];

beforeAll(() => {
  ensureFixtureRepos();
});

describe("fixture git history", () => {
  test("getCommitHistory returns reverse chronological order", async () => {
    const commits = await getCommitHistory(fixtureRepoPath("simple"), {
      maxCount: 10,
    });

    expect(commits).toHaveLength(10);
    for (let index = 1; index < commits.length; index += 1) {
      expect(commits[index - 1]?.timestamp).toBeGreaterThanOrEqual(
        commits[index]?.timestamp ?? 0,
      );
    }
  });

  test("getFileBlame line counts match wc -l", async () => {
    const repoPath = fixtureRepoPath("simple");
    const relativePath = "src/index.ts";
    const absolutePath = path.join(repoPath, relativePath);
    const blame = await getFileBlame(repoPath, relativePath);
    const wcOutput = execFileSync("wc", ["-l", absolutePath], {
      encoding: "utf8",
    }).trim();
    const [countRaw] = wcOutput.split(/\s+/, 1);
    const wcCount = Number.parseInt(countRaw ?? "0", 10);

    expect(blame.lines).toHaveLength(wcCount);
  });
});

describe("analysis pipeline", () => {
  test("simple fixture keeps single-owner files at bus factor 1", async () => {
    const report = await analyseFixture("simple");

    expect(report.busFactor.criticalFiles.length).toBe(report.meta.totalFiles);
    expect(report.busFactor.criticalFiles.every((metric) => metric.busFactor === 1)).toBe(
      true,
    );
  });

  test("report.json validates against the critical schema on every fixture repo", async () => {
    for (const fixtureName of fixtureNames) {
      const report = await analyseFixture(fixtureName);
      expectReport(report);
    }
  });

  test("large fixture cache makes the second run significantly faster", async () => {
    const sourceRepo = fixtureRepoPath("large");
    const repoPath = await createTempDir("strata-large-clone-");
    await cp(sourceRepo, repoPath, {
      recursive: true,
      force: true,
    });
    const outDir = await createTempDir("strata-large-cache-");

    const firstStarted = performance.now();
    await analyseRepository(repoPath, {
      outDir,
      cache: true,
      browser: false,
      format: "json",
    });
    const firstDuration = performance.now() - firstStarted;

    const secondStarted = performance.now();
    await analyseRepository(repoPath, {
      outDir,
      cache: true,
      browser: false,
      format: "json",
    });
    const secondDuration = performance.now() - secondStarted;

    expect(secondDuration).toBeLessThan(firstDuration / 10);
  });
});

async function analyseFixture(fixtureName: FixtureName): Promise<StrataReport> {
  const repoPath = fixtureRepoPath(fixtureName);
  const outDir = await createTempDir(`strata-${fixtureName}-`);
  const result = await analyseRepository(repoPath, {
    outDir,
    cache: false,
    browser: false,
    format: "json",
  });

  return result.report;
}

function expectReport(report: StrataReport): void {
  expect(report.meta.schemaVersion).toBe(1);
  expect(report.meta.strataVersion).toBe("1.0.0");
  expect(report.meta.repoName).toBeTruthy();
  expect(report.meta.totalCommits).toBe(report.commits.length);
  expect(report.meta.totalFiles).toBe(report.hotspots.length);
  expect(report.meta.totalFiles).toBe(report.loc.current.length);
  expect(report.meta.totalFiles).toBe(report.age.length);
  expect(report.meta.totalAuthors).toBe(report.authors.length);
  expect(report.summary.kpis.length).toBeGreaterThan(0);
  expect(flattenTree(report.fileTree).length).toBeGreaterThanOrEqual(
    report.meta.totalFiles,
  );
  expect(new Set(flattenTree(report.fileTree).map((node) => node.path)).size).toBe(
    flattenTree(report.fileTree).length,
  );

  for (const hotspot of report.hotspots) {
    expect(hotspot.hotspotScore).toBeGreaterThanOrEqual(0);
    expect(hotspot.hotspotScore).toBeLessThanOrEqual(100);
  }

  for (const age of report.age) {
    expect(age.newestLineAgeDays).toBeLessThanOrEqual(age.medianLineAgeDays);
    expect(age.medianLineAgeDays).toBeLessThanOrEqual(age.oldestLineAgeDays);
  }

  for (const metric of report.loc.current) {
    expect(metric.codeLines + metric.commentLines + metric.blankLines).toBe(
      metric.totalLines,
    );
  }

  for (const edge of report.coupling.edges) {
    expect(edge.strength).toBeGreaterThanOrEqual(0);
    expect(edge.strength).toBeLessThanOrEqual(1);
  }

  for (const author of report.authors) {
    expect(author.commitHeatmap.length).toBeGreaterThan(0);
  }

  expect(uniqueHistoryLanguages(report.loc.history).length).toBeGreaterThan(0);
  expect(report.loc.history.map((snapshot) => snapshot.date)).toEqual(
    [...report.loc.history]
      .map((snapshot) => snapshot.date)
      .sort((left, right) => left.localeCompare(right)),
  );
}
