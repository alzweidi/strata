import { performance } from "node:perf_hooks";

import pc from "picocolors";

import { createSpinner } from "nanospinner";

export interface ProgressPhase {
  label: string;
  startedAt: number;
  spinner: ReturnType<typeof createSpinner>;
}

export interface ProgressReporter {
  startPhase(label: string): void;
  succeedPhase(label: string): void;
  failPhase(label: string, message: string): void;
  stop(message?: string): void;
}

/**
 * Creates a phase-based terminal progress reporter with spinner support.
 *
 * @returns A progress reporter suitable for CLI analysis runs.
 */
export function createProgressReporter(): ProgressReporter {
  let current: ProgressPhase | undefined;

  return {
    startPhase(label: string): void {
      current = {
        label,
        startedAt: performance.now(),
        spinner: createSpinner(pc.cyan(label)).start(),
      };
    },
    succeedPhase(label: string): void {
      if (!current) {
        return;
      }

      const elapsed = formatElapsed(performance.now() - current.startedAt);
      current.spinner.success({ text: `${pc.green(label)} ${pc.dim(elapsed)}` });
      current = undefined;
    },
    failPhase(label: string, message: string): void {
      if (!current) {
        return;
      }

      current.spinner.error({
        text: `${pc.red(label)} ${pc.dim(message)}`,
      });
      current = undefined;
    },
    stop(message?: string): void {
      if (!current) {
        return;
      }

      current.spinner.stop({
        text: message ? pc.dim(message) : undefined,
      });
      current = undefined;
    },
  };
}

function formatElapsed(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `(${Math.round(milliseconds)}ms)`;
  }

  return `(${(milliseconds / 1000).toFixed(2)}s)`;
}
