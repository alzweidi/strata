import { Command } from "commander";

import { diffCommits } from "../report.js";
import { printDiffTable } from "../output.js";
import { resolveRepositoryRoot } from "../git.js";

/**
 * Registers the `diff` command on the Strata CLI.
 *
 * @param program The Commander program to extend.
 * @returns The configured subcommand.
 */
export function registerDiffCommand(program: Command): Command {
  return program
    .command("diff")
    .description("Show a metric diff between two commits.")
    .argument("<sha1>", "Base commit SHA")
    .argument("<sha2>", "Target commit SHA")
    .action(async (fromSha: string, toSha: string) => {
      const repoPath = await resolveRepositoryRoot(process.cwd());
      const report = await diffCommits(repoPath, fromSha, toSha);
      printDiffTable(report);
    });
}

