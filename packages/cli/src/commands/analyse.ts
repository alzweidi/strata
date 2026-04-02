import path from "node:path";

import { Command } from "commander";
import pc from "picocolors";

import type { StrataConfig } from "@strata/core";

import { analyseRepository } from "../report.js";
import { createProgressReporter } from "../progress.js";
import { printSummaryTable } from "../output.js";
import { startReportServer } from "../server.js";
import type { AnalyseCommandOptions } from "../types.js";

import open from "open";

/**
 * Registers the `analyse` command on the Strata CLI.
 *
 * @param program The Commander program to extend.
 * @returns The configured subcommand.
 */
export function registerAnalyseCommand(program: Command): Command {
  const collect = (value: string, previous: string[]): string[] => [...previous, value];

  return program
    .command("analyse")
    .description("Analyse a repository and generate a Strata report.")
    .argument("<repo-path>", "Repository path to analyse")
    .option("--out <dir>", "Output directory", ".strata")
    .option("--no-browser", "Don't open browser after analysis")
    .option("--no-cache", "Force full re-analysis")
    .option("--port <n>", "Dashboard server port", parseIntOption, 4321)
    .option("--since <date>", "Only analyse commits after this date")
    .option("--ignore <glob>", "Glob patterns to exclude", collect, [] as string[])
    .option("--concurrency <n>", "Parallel git operations", parseIntOption, 4)
    .option("--min-coupling <n>", "Min co-changes to show in coupling", parseIntOption, 3)
    .option("--format <fmt>", "Output format: dashboard|json|csv", "dashboard")
    .option("--watch", "Re-analyse on new commits (polling)")
    .action(async (repoPath: string, options: AnalyseCommandOptions, command: Command) => {
      await runAnalyse(repoPath, options, command);
    });
}

async function runAnalyse(
  repoPath: string,
  options: AnalyseCommandOptions,
  command: Command,
): Promise<void> {
  const progress = createProgressReporter();
  const configOverrides = buildConfigOverrides(options, command);
  configOverrides.ci = isCiEnvironment();

  progress.startPhase("Extracting history...");
  const bundle = await analyseRepository(repoPath, configOverrides);
  progress.succeedPhase("Extracting history...");

  progress.startPhase("Analysing hotspots...");
  progress.succeedPhase("Analysing hotspots...");

  if (bundle.config.format === "json") {
    progress.startPhase("Rendering...");
    process.stdout.write(`${JSON.stringify(bundle.report, null, 2)}\n`);
    progress.succeedPhase("Rendering...");
    return;
  }

  if (bundle.config.format === "csv") {
    progress.startPhase("Rendering...");
    const csvPaths = await exportCsvOnly(bundle.reportDir);
    process.stdout.write(`${csvPaths.join("\n")}\n`);
    progress.succeedPhase("Rendering...");
    return;
  }

  progress.startPhase("Rendering...");
  const server = await startReportServer(bundle.reportDir, bundle.config.port);
  const url = server.url;

  if (bundle.config.browser && !configOverrides.ci) {
    await open(url);
  }

  printSummaryTable(bundle.report, url);
  progress.succeedPhase("Rendering...");

  if (bundle.config.watch) {
    await watchForChanges(
      repoPath,
      server.url,
      configOverrides,
      bundle.report.meta.headSha,
      async () => {
        await server.close();
      },
    );
    return;
  }

  if (configOverrides.ci) {
    await server.close();
    return;
  }

  process.stdout.write(`${pc.dim("Dashboard server running. Press Ctrl+C to stop.")}\n`);
  await waitForShutdown(async () => {
    await server.close();
  });
}

async function watchForChanges(
  repoPath: string,
  url: string,
  overrides: Partial<StrataConfig>,
  initialHeadSha: string,
  onShutdown: () => Promise<void>,
): Promise<void> {
  let currentHead = initialHeadSha;
  process.stdout.write(`${pc.dim(`Watching ${path.resolve(repoPath)} for changes...`)}\n`);

  const interval = setInterval(async () => {
    try {
      const nextBundle = await analyseRepository(repoPath, overrides);
      if (nextBundle.report.meta.headSha === currentHead) {
        return;
      }

      currentHead = nextBundle.report.meta.headSha;
      printSummaryTable(nextBundle.report, url);
    } catch (error) {
      process.stderr.write(`${pc.red(String(error))}\n`);
    }
  }, 5000);

  await new Promise<void>((resolve) => {
    const stop = async (): Promise<void> => {
      clearInterval(interval);
      await onShutdown();
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function waitForShutdown(onShutdown: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = async (): Promise<void> => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await onShutdown();
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function exportCsvOnly(reportDir: string): Promise<string[]> {
  const { exportReport } = await import("../report.js");
  return await exportReport(reportDir, "csv");
}

function buildConfigOverrides(
  options: AnalyseCommandOptions,
  command: Command,
): Partial<StrataConfig> {
  const overrides: Partial<StrataConfig> = {};

  if (command.getOptionValueSource("out") === "cli") {
    overrides.outDir = options.out;
  }

  if (command.getOptionValueSource("browser") === "cli") {
    overrides.browser = options.browser;
  }

  if (command.getOptionValueSource("cache") === "cli") {
    overrides.cache = options.cache;
  }

  if (command.getOptionValueSource("port") === "cli") {
    overrides.port = options.port;
  }

  if (command.getOptionValueSource("since") === "cli") {
    overrides.since = options.since;
  }

  if (command.getOptionValueSource("ignore") === "cli") {
    overrides.ignore = options.ignore;
  }

  if (command.getOptionValueSource("concurrency") === "cli") {
    overrides.concurrency = options.concurrency;
  }

  if (command.getOptionValueSource("minCoupling") === "cli") {
    overrides.minCoupling = options.minCoupling;
  }

  if (command.getOptionValueSource("format") === "cli") {
    overrides.format = options.format;
  }

  if (command.getOptionValueSource("watch") === "cli") {
    overrides.watch = options.watch;
  }

  return overrides;
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
