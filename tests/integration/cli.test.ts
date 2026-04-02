import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { ensureFixtureRepos, fixtureRepoPath, createTempDir } from "../support/fixtures.ts";

const mocks = vi.hoisted(() => {
  const open = vi.fn();
  const analyseRepository = vi.fn();
  const close = vi.fn(async () => undefined);
  const startReportServer = vi.fn(async () => ({
    url: "http://127.0.0.1:4321",
    close,
  }));
  const printSummaryTable = vi.fn();
  const createProgressReporter = vi.fn(() => ({
    startPhase: vi.fn(),
    succeedPhase: vi.fn(),
  }));

  return {
    open,
    analyseRepository,
    close,
    startReportServer,
    printSummaryTable,
    createProgressReporter,
  };
});

vi.mock("open", () => ({
  default: mocks.open,
}));

vi.mock("../../packages/cli/src/report.ts", () => ({
  analyseRepository: mocks.analyseRepository,
}));

vi.mock("../../packages/cli/src/server.ts", () => ({
  startReportServer: mocks.startReportServer,
}));

vi.mock("../../packages/cli/src/output.ts", () => ({
  printSummaryTable: mocks.printSummaryTable,
}));

vi.mock("../../packages/cli/src/progress.ts", () => ({
  createProgressReporter: mocks.createProgressReporter,
}));

import { main } from "../../packages/cli/src/index.ts";

beforeAll(() => {
  ensureFixtureRepos();
});

afterEach(() => {
  mocks.open.mockReset();
  mocks.analyseRepository.mockReset();
  mocks.close.mockReset();
  mocks.startReportServer.mockClear();
  mocks.printSummaryTable.mockClear();
  mocks.createProgressReporter.mockClear();
});

describe("CLI", () => {
  test("skips browser launch in CI mode", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const originalCi = process.env.CI;

    mocks.analyseRepository.mockResolvedValue({
      config: {
        browser: true,
        format: "dashboard",
        port: 4321,
        watch: false,
      },
      report: {
        meta: {
          headSha: "abc123",
        },
      },
      reportDir: "/tmp/strata-report",
      reportPath: "/tmp/strata-report/report.json",
    });

    process.argv = ["node", "strata", "analyse", fixtureRepoPath("simple")];
    process.env.CI = "1";

    try {
      await main();
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }

    expect(mocks.analyseRepository).toHaveBeenCalledTimes(1);
    expect(mocks.startReportServer).toHaveBeenCalledTimes(1);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  test("strata analyse exits 0 on the simple fixture repo in json mode", async () => {
    ensureFixtureRepos();
    const repoPath = fixtureRepoPath("simple");
    const outDir = await createTempDir("strata-cli-json-");
    const cliEntry = path.join(
      process.cwd(),
      "packages",
      "cli",
      "src",
      "index.ts",
    );

    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "analyse", repoPath, "--format", "json", "--out", outDir],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "1",
          TSX_TSCONFIG_PATH: path.join(process.cwd(), "tests", "tsconfig.json"),
        },
      },
    );

    expect(stdout.length).toBeGreaterThan(0);
    await access(path.join(outDir, "report.json"));
  });
});
