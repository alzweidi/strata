#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyseRepository } from "../packages/cli/src/report.ts";

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const repoPath = process.argv[2] ?? path.join(fixturesDir, "large");
const reportPath = process.argv[3] ?? path.join(fixturesDir, "report.json");
const outputDir = path.join(fixturesDir, ".report-output");

const result = await analyseRepository(repoPath, {
  outDir: outputDir,
  browser: false,
  cache: false,
  format: "json",
});

await writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
