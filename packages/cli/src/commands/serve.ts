import { Command } from "commander";
import pc from "picocolors";

import open from "open";

import { loadReport } from "../report.js";
import { startReportServer } from "../server.js";
import { printServeInfo } from "../output.js";
import type { ServeCommandOptions } from "../types.js";

/**
 * Registers the `serve` command on the Strata CLI.
 *
 * @param program The Commander program to extend.
 * @returns The configured subcommand.
 */
export function registerServeCommand(program: Command): Command {
  return program
    .command("serve")
    .description("Serve an existing Strata report directory.")
    .argument("<report-dir>", "Directory containing report.json")
    .option("--port <n>", "Dashboard server port", parseIntOption, 4321)
    .option("--no-browser", "Don't open browser after starting the server")
    .action(async (reportDir: string, options: ServeCommandOptions) => {
      await runServe(reportDir, options);
    });
}

async function runServe(reportDir: string, options: ServeCommandOptions): Promise<void> {
  const report = await loadReport(reportDir);
  const server = await startReportServer(reportDir, options.port);
  printServeInfo(server.url, `${reportDir}/report.json`);

  if (options.browser && !isCiEnvironment()) {
    await open(server.url);
  }

  process.stdout.write(`${pc.dim(report.meta.repoName)}\n`);

  await new Promise<void>((resolve) => {
    const stop = async (): Promise<void> => {
      await server.close();
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
}

function isCiEnvironment(): boolean {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
}
