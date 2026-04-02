import { Command } from "commander";

import { loadConfig } from "@strata/core";

import { resolveRepositoryRoot } from "../git.js";
import { exportReport } from "../report.js";

/**
 * Registers the `export` command on the Strata CLI.
 *
 * @param program The Commander program to extend.
 * @returns The configured subcommand.
 */
export function registerExportCommand(program: Command): Command {
  return program
    .command("export")
    .description("Export the current report as CSV or JSON.")
    .argument("<format>", "Export format: csv|json")
    .action(async (format: string) => {
      await runExport(format);
    });
}

async function runExport(format: string): Promise<void> {
  const repoPath = await resolveRepositoryRoot(process.cwd());
  const config = await loadConfig(repoPath, {});
  const exportPaths = await exportReport(config.outDir, normalizeFormat(format));
  process.stdout.write(`${exportPaths.join("\n")}\n`);
}

function normalizeFormat(format: string): "csv" | "json" {
  if (format === "csv" || format === "json") {
    return format;
  }

  throw new Error(`Unsupported export format: ${format}`);
}

