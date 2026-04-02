import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { resolveAbsolutePath } from "./utils.js";

const execFileAsync = promisify(execFile);

export interface ResolvedAnalyseSource {
  repoPath: string;
  displayPath: string;
  defaultOutDir?: string;
  isRemote: boolean;
  cleanup: () => Promise<void>;
}

export function isRemoteRepositorySource(value: string): boolean {
  return (
    /^[a-z]+:\/\//i.test(value) ||
    /^git@/i.test(value) ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
  );
}

export async function resolveAnalyseSource(input: string): Promise<ResolvedAnalyseSource> {
  if (!isRemoteRepositorySource(input)) {
    const repoPath = resolveAbsolutePath(input, process.cwd());
    return {
      repoPath,
      displayPath: repoPath,
      isRemote: false,
      cleanup: async () => undefined,
    };
  }

  const remoteUrl = normalizeRemoteRepositoryUrl(input);
  const repoName = deriveRepositoryName(remoteUrl);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "strata-source-"));
  const repoPath = path.join(tempRoot, repoName);

  try {
    await execFileAsync(
      "git",
      ["clone", "--quiet", "--no-single-branch", buildCloneUrl(remoteUrl), repoPath],
      {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw normalizeCloneError(remoteUrl, error);
  }

  return {
    repoPath,
    displayPath: remoteUrl,
    defaultOutDir: path.join(process.cwd(), ".strata", repoName),
    isRemote: true,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function normalizeRemoteRepositoryUrl(input: string): string {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) {
    return `https://github.com/${input}.git`;
  }

  const sshMatch = input.match(/^git@github\.com:(.+)$/i);
  if (sshMatch) {
    return normalizeGitHubUrl(`https://github.com/${sshMatch[1]}`);
  }

  if (input.startsWith("ssh://git@github.com/")) {
    return normalizeGitHubUrl(input.replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/"));
  }

  if (/^https?:\/\//i.test(input)) {
    return normalizeGitHubUrl(input);
  }

  return input;
}

function normalizeGitHubUrl(input: string): string {
  const url = new URL(input);
  if (url.hostname !== "github.com") {
    return url.toString();
  }

  if (!url.pathname.endsWith(".git")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}.git`;
  }

  return url.toString();
}

function buildCloneUrl(remoteUrl: string): string {
  const token = process.env.STRATA_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return remoteUrl;
  }

  if (!remoteUrl.startsWith("https://")) {
    return remoteUrl;
  }

  const url = new URL(remoteUrl);
  if (url.hostname !== "github.com") {
    return remoteUrl;
  }

  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

function deriveRepositoryName(remoteUrl: string): string {
  if (/^https?:\/\//i.test(remoteUrl) || /^file:\/\//i.test(remoteUrl)) {
    const url = new URL(remoteUrl);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "repository";
    return lastSegment.replace(/\.git$/i, "") || "repository";
  }

  const cleaned = remoteUrl.split(/[/:]/).filter(Boolean).at(-1) ?? "repository";
  return cleaned.replace(/\.git$/i, "") || "repository";
}

function normalizeCloneError(remoteUrl: string, error: unknown): Error {
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : "";

  const message = stderr.trim();
  if (
    /repository not found|authentication failed|could not read username|access denied/i.test(
      message,
    )
  ) {
    return new Error(
      `Unable to clone ${remoteUrl}. For a private GitHub repository, use an https://github.com/... URL and set GITHUB_TOKEN or STRATA_GITHUB_TOKEN.`,
    );
  }

  return error instanceof Error
    ? error
    : new Error(`Unable to clone remote repository: ${remoteUrl}`);
}
