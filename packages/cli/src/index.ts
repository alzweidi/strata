import { fileURLToPath } from "node:url";
import path from "node:path";

import { Command } from "commander";
import pc from "picocolors";

import { registerAnalyseCommand } from "./commands/analyse.js";
import { registerCleanCommand } from "./commands/clean.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerExportCommand } from "./commands/export.js";
import { registerServeCommand } from "./commands/serve.js";

const CLI_VERSION = "1.0.0";

/**
 * Builds the Strata Commander program with all supported commands.
 *
 * @returns The configured Commander instance.
 */
export function createStrataCli(): Command {
  const program = new Command();
  program
    .name("strata")
    .description("Repository intelligence platform for local git analysis.")
    .version(CLI_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError();

  registerAnalyseCommand(program);
  registerServeCommand(program);
  registerCleanCommand(program);
  registerDiffCommand(program);
  registerExportCommand(program);
  return program;
}

/**
 * Runs the Strata CLI entrypoint with friendly error handling.
 *
 * @returns A promise that resolves when execution finishes.
 */
export async function main(): Promise<void> {
  warnOnOldNode();
  const program = createStrataCli();

  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    reportCliError(error);
    process.exitCode = 1;
  }
}

function warnOnOldNode(): void {
  const [major] = process.versions.node.split(".");
  const majorVersion = Number.parseInt(major ?? "0", 10);
  if (Number.isFinite(majorVersion) && majorVersion < 20) {
    process.stderr.write(
      `${pc.yellow("Warning")}: Strata targets Node.js 20+, current version is ${process.versions.node}\n`,
    );
  }
}

function reportCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const suggestion = buildSuggestion(message);
  process.stderr.write(`${pc.red("Error")}: ${message}\n`);
  if (suggestion) {
    process.stderr.write(`${pc.dim(suggestion)}\n`);
  }
}

function buildSuggestion(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (normalized.includes("repository path does not exist")) {
    return "Replace the example path with the real absolute path to your repository, for example `/Users/atta/code/anthedon-farm-os`.";
  }

  if (normalized.includes("git executable was not found on path") || normalized.includes("spawn git enoent")) {
    return "Run `git --version` in this shell. If that fails, install Git or start a shell where Git is on PATH.";
  }

  if (normalized.includes("unable to clone") && normalized.includes("private github repository")) {
    return "Set `GITHUB_TOKEN=...` (or `STRATA_GITHUB_TOKEN=...`) and pass an `https://github.com/owner/repo.git` URL.";
  }

  if (normalized.includes("not a git repository")) {
    return "Run the command from inside a git repository or pass a repository path.";
  }

  if (normalized.includes("report.json") && normalized.includes("enoent")) {
    return "Run `strata analyse <repo-path>` first, or point `strata serve` at an existing report directory.";
  }

  if (normalized.includes("unsupported export format")) {
    return "Use `csv` or `json` for the export command.";
  }

  return undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
