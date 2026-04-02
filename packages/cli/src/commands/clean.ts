import path from "node:path";

import { Command } from "commander";

import { loadConfig } from "@strata/core";

import { resolveRepositoryRoot } from "../git.js";
import { removeReportDirectory } from "../report.js";
import { resolveAbsolutePath } from "../utils.js";

/**
 * Registers the `clean` command on the Strata CLI.
 *
 * @param program The Commander program to extend.
 * @returns The configured subcommand.
 */
export function registerCleanCommand(program: Command): Command {
  return program
    .command("clean")
    .description("Delete the Strata cache directory for a repository.")
    .argument("<repo-path>", "Repository path to clean")
    .action(async (repoPath: string) => {
      await runClean(repoPath);
    });
}

async function runClean(repoPath: string): Promise<void> {
  const absolutePath = resolveAbsolutePath(repoPath, process.cwd());
  try {
    const rootPath = await resolveRepositoryRoot(absolutePath);
    const config = await loadConfig(rootPath, {});
    await removeReportDirectory(config.outDir);
    return;
  } catch {
    await removeReportDirectory(path.join(absolutePath, ".strata"));
  }
}

