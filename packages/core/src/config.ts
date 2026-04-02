import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { StrataConfig } from "./types.js";

export const DEFAULT_CONFIG: StrataConfig = {
  outDir: ".strata",
  browser: true,
  cache: true,
  port: 4321,
  ignore: ["dist/**", "node_modules/**"],
  concurrency: 4,
  minCoupling: 3,
  format: "dashboard",
  watch: false,
  ci: false,
};

/**
 * Loads Strata configuration from `.stratarc.json` in the target repository and
 * applies CLI overrides on top.
 *
 * @param repoPath The repository root being analysed.
 * @param overrides Partial config supplied by the CLI.
 * @returns A normalized configuration object ready for execution.
 */
export async function loadConfig(
  repoPath: string,
  overrides: Partial<StrataConfig> = {},
): Promise<StrataConfig> {
  const configPath = path.join(repoPath, ".stratarc.json");
  const diskConfig = await readConfigFile(configPath);
  const merged = {
    ...DEFAULT_CONFIG,
    ...diskConfig,
    ...overrides,
  } satisfies StrataConfig;

  return {
    ...merged,
    ignore: Array.from(new Set(merged.ignore)),
    outDir: path.isAbsolute(merged.outDir)
      ? merged.outDir
      : path.join(repoPath, merged.outDir),
  };
}

/**
 * Ensures the configured output directory exists before a report is written.
 *
 * @param config The normalized Strata config.
 * @returns The absolute output directory path.
 */
export async function ensureOutputDir(config: StrataConfig): Promise<string> {
  await mkdir(config.outDir, { recursive: true });
  return config.outDir;
}

async function readConfigFile(
  configPath: string,
): Promise<Partial<StrataConfig>> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StrataConfig>;
    return parsed;
  } catch (error) {
    if (isMissingFile(error)) {
      return {};
    }

    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

