import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StrataReport } from "../../packages/ui/src/types/report.ts";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, "../..");
const fixturesDir = path.join(repoRoot, "fixtures");
const bootstrapScript = path.join(fixturesDir, "bootstrap-fixtures.mjs");

export type FixtureName = "simple" | "team" | "large";

export function fixtureRepoPath(name: FixtureName): string {
  return path.join(fixturesDir, name);
}

export function ensureFixtureRepos(): void {
  execFileSync("node", [bootstrapScript], {
    cwd: repoRoot,
    stdio: "pipe",
    env: process.env,
  });
}

export async function createTempDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function loadFixtureReport(): Promise<StrataReport> {
  const raw = await readFile(path.join(fixturesDir, "report.json"), "utf8");
  return JSON.parse(raw) as StrataReport;
}
