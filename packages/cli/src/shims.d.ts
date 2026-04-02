declare module "nanospinner" {
  export interface SpinnerOptions {
    color?: string;
    frames?: readonly string[];
    interval?: number;
  }

  export interface SpinnerController {
    start(): SpinnerController;
    stop(options?: { text?: string }): SpinnerController;
    success(options?: { text?: string }): SpinnerController;
    error(options?: { text?: string }): SpinnerController;
    warn(options?: { text?: string }): SpinnerController;
  }

  export function createSpinner(
    text: string,
    options?: SpinnerOptions,
  ): SpinnerController;
}

declare module "open" {
  function open(target: string, options?: Record<string, unknown>): Promise<void>;
  export default open;
}
