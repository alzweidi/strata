#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repos = [
  ["simple", buildSimpleRepo],
  ["team", buildTeamRepo],
  ["large", buildLargeRepo],
];

await main();

async function main() {
  for (const [name, builder] of repos) {
    const repoPath = path.join(here, name);
    await builder(repoPath);
  }
}

async function buildSimpleRepo(repoPath) {
  if (await hasGitHistory(repoPath)) {
    return;
  }

  await resetDirectory(repoPath);
  await initRepo(repoPath);

  const files = new Map([
    ["src/index.ts", simpleIndexSource(0)],
    ["src/math.ts", simpleMathSource(0)],
    ["docs/notes.md", simpleNotesSource(0)],
  ]);

  const author = { name: "Solo Dev", email: "solo@example.com" };
  const start = Date.UTC(2026, 0, 1, 9, 0, 0);
  const steps = [
    ["Initial simple fixture", ["src/index.ts", "src/math.ts", "docs/notes.md"]],
    ["Tighten math guard", ["src/math.ts"]],
    ["Adjust entrypoint flow", ["src/index.ts"]],
    ["Expand notes", ["docs/notes.md"]],
    ["Refine math branch", ["src/math.ts"]],
    ["Streamline entrypoint", ["src/index.ts"]],
    ["Document edge cases", ["docs/notes.md"]],
    ["Add math fallback", ["src/math.ts"]],
    ["Tune index wiring", ["src/index.ts"]],
    ["Close out fixture notes", ["docs/notes.md"]],
  ];

  for (const [index, [message, touched]] of steps.entries()) {
    bumpFiles(files, touched);
    await writeFiles(repoPath, files);
    await commit(repoPath, {
      author,
      message,
      date: new Date(start + index * dayMs(3)),
    });
  }
}

async function buildTeamRepo(repoPath) {
  if (await hasGitHistory(repoPath)) {
    return;
  }

  await resetDirectory(repoPath);
  await initRepo(repoPath);

  const files = new Map(
    teamFileList().map((filePath, index) => [filePath, teamSource(filePath, 0, index)]),
  );
  const authors = [
    { name: "Ava Kim", email: "ava@example.com" },
    { name: "Noah Singh", email: "noah@example.com" },
    { name: "Mila Torres", email: "mila@example.com" },
    { name: "Omar Patel", email: "omar@example.com" },
  ];
  const start = Date.UTC(2026, 1, 1, 9, 0, 0);

  await writeFiles(repoPath, files);
  await commit(repoPath, {
    author: authors[0],
    message: "Seed team fixture",
    date: new Date(start),
  });

  for (let index = 1; index < 50; index += 1) {
    const author = authors[index % authors.length];
    const touched = teamTouchSet(index, author.name);
    bumpFiles(files, touched);
    await writeFiles(repoPath, files);
    await commit(repoPath, {
      author,
      message: `Team fixture commit ${index}`,
      date: new Date(start + dayMs(index)),
    });
  }
}

async function buildLargeRepo(repoPath) {
  if (await hasGitHistory(repoPath)) {
    return;
  }

  await resetDirectory(repoPath);
  await initRepo(repoPath);

  const files = new Map(largeFileList().map((filePath, index) => [filePath, largeSource(filePath, 0, index)]));
  const authors = [
    { name: "Ava Kim", email: "ava@example.com" },
    { name: "Noah Singh", email: "noah@example.com" },
    { name: "Mila Torres", email: "mila@example.com" },
    { name: "Omar Patel", email: "omar@example.com" },
    { name: "Priya Shah", email: "priya@example.com" },
    { name: "Leo Chen", email: "leo@example.com" },
    { name: "Zoe Park", email: "zoe@example.com" },
    { name: "Ravi Gupta", email: "ravi@example.com" },
  ];
  const start = Date.UTC(2025, 0, 1, 9, 0, 0);

  await writeFiles(repoPath, files);
  await commit(repoPath, {
    author: authors[0],
    message: "Seed large fixture",
    date: new Date(start),
  });

  for (let index = 1; index < 200; index += 1) {
    const author = authors[index % authors.length];
    const touched = largeTouchSet(index, author.name);
    bumpFiles(files, touched);
    await writeFiles(repoPath, files);
    await commit(repoPath, {
      author,
      message: `Large fixture commit ${index}`,
      date: new Date(start + dayMs(index)),
    });
  }
}

function teamFileList() {
  return [
    "README.md",
    "src/auth/session.ts",
    "src/auth/secrets.ts",
    "src/auth/tokens.ts",
    "src/api/client.ts",
    "src/api/router.ts",
    "src/billing/invoice.ts",
    "src/billing/rates.ts",
    "src/data/archive.ts",
    "src/data/store.ts",
    "src/jobs/queue.ts",
    "src/jobs/scheduler.ts",
    "src/shared/config.ts",
    "src/shared/http.ts",
    "src/shared/logger.ts",
    "src/ui/panel.ts",
    "src/ui/theme.ts",
    "src/ops/ledger.ts",
    "src/ops/telemetry.ts",
    "tests/auth.spec.ts",
  ];
}

function largeFileList() {
  const files = [];
  for (let area = 1; area <= 10; area += 1) {
    for (let index = 1; index <= 10; index += 1) {
      files.push(`src/area-${String(area).padStart(2, "0")}/module-${String(index).padStart(2, "0")}.ts`);
    }
  }
  return files;
}

function teamTouchSet(commitIndex, authorName) {
  const groups = [
    ["src/shared/logger.ts", "src/shared/config.ts"],
    ["src/auth/session.ts", "src/auth/tokens.ts"],
    ["src/billing/invoice.ts", "src/billing/rates.ts"],
    ["src/api/router.ts", "src/api/client.ts"],
    ["src/ui/panel.ts", "src/jobs/queue.ts"],
    ["src/jobs/queue.ts", "src/jobs/scheduler.ts"],
    ["src/data/store.ts", "src/shared/http.ts"],
    ["src/ops/telemetry.ts", "src/data/store.ts"],
  ];

  const specialFiles = new Map([
    ["Ava Kim", "src/auth/secrets.ts"],
    ["Noah Singh", "src/data/archive.ts"],
    ["Mila Torres", "src/ui/theme.ts"],
    ["Omar Patel", "src/ops/ledger.ts"],
  ]);

  const touched = new Set(groups[commitIndex % groups.length] ?? []);
  const special = specialFiles.get(authorName);
  if (special) {
    touched.add(special);
  }

  if (commitIndex % 3 === 0) {
    touched.add("src/jobs/queue.ts");
  }

  if (commitIndex % 4 === 0) {
    touched.add("src/shared/http.ts");
  }

  return [...touched];
}

function largeTouchSet(commitIndex, authorName) {
  const basePair = Math.floor(commitIndex / 5) % 20;
  const first = `src/area-${String(Math.floor(basePair / 2) + 1).padStart(2, "0")}/module-${String((basePair * 2) % 10 + 1).padStart(2, "0")}.ts`;
  const second = `src/area-${String(Math.floor(basePair / 2) + 1).padStart(2, "0")}/module-${String((basePair * 2 + 1) % 10 + 1).padStart(2, "0")}.ts`;
  const ringIndex = commitIndex % 10;
  const rotating = `src/area-${String((commitIndex % 10) + 1).padStart(2, "0")}/module-${String(ringIndex + 1).padStart(2, "0")}.ts`;
  const specialFiles = new Map([
    ["Ava Kim", "src/area-01/module-01.ts"],
    ["Noah Singh", "src/area-02/module-02.ts"],
    ["Mila Torres", "src/area-03/module-03.ts"],
    ["Omar Patel", "src/area-04/module-04.ts"],
    ["Priya Shah", "src/area-05/module-05.ts"],
    ["Leo Chen", "src/area-06/module-06.ts"],
    ["Zoe Park", "src/area-07/module-07.ts"],
    ["Ravi Gupta", "src/area-08/module-08.ts"],
  ]);

  const touched = new Set([first, second]);
  if (commitIndex % 2 === 0) {
    touched.add(rotating);
  }

  const special = specialFiles.get(authorName);
  if (special) {
    touched.add(special);
  }

  return [...touched];
}

function bumpFiles(files, touched) {
  for (const filePath of touched) {
    const current = files.get(filePath);
    if (current === undefined) {
      continue;
    }

    const version = nextVersion(current);
    files.set(filePath, sourceForFile(filePath, version));
  }
}

function nextVersion(current) {
  const patterns = [
    /version = (\d+);/i,
    /Version = (\d+);/i,
    /Fixture revision (\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = current.match(pattern);
    if (match?.[1] !== undefined) {
      return Number(match[1]) + 1;
    }
  }

  return 1;
}

function sourceForFile(filePath, version) {
  if (filePath.endsWith(".md")) {
    return markdownSource(filePath, version);
  }

  if (filePath.startsWith("src/area-")) {
    return largeSource(filePath, version, hashPath(filePath));
  }

  return teamSource(filePath, version, hashPath(filePath));
}

function teamSource(filePath, version, seed) {
  if (filePath === "README.md") {
    return markdownSource(filePath, version);
  }

  const symbol = symbolName(filePath);
  const profile = seed % 3;
  const lines = [
    `export const ${symbol}Version = ${version};`,
    `export function ${symbol}(input: number): number {`,
    `  const base = input + ${seed % 11};`,
  ];

  if (profile === 0) {
    lines.push(`  return base + ${version};`);
  } else if (profile === 1) {
    lines.push(`  if (base % 2 === 0) {`);
    lines.push(`    return base * 2 + ${version};`);
    lines.push("  }");
    lines.push(`  return base + ${version};`);
  } else {
    lines.push("  let total = 0;");
    lines.push(`  for (let index = 0; index < 3; index += 1) {`);
    lines.push("    total += base + index;");
    lines.push("  }");
    lines.push("  return total + 1;");
  }

  lines.push("}");
  return lines.join("\n");
}

function largeSource(filePath, version, seed) {
  const symbol = symbolName(filePath);
  const profile = seed % 4;
  const lines = [
    `export const ${symbol}Version = ${version};`,
    `export function ${symbol}(input: number): number {`,
    `  const base = input + ${seed % 17};`,
  ];

  if (profile === 0) {
    lines.push(`  return base + ${version};`);
  } else if (profile === 1) {
    lines.push("  if (base % 2 === 0) {");
    lines.push(`    return base * 2 + ${version};`);
    lines.push("  }");
    lines.push(`  return base + ${version};`);
  } else if (profile === 2) {
    lines.push("  let total = 0;");
    lines.push("  for (let index = 0; index < 4; index += 1) {");
    lines.push("    if (index % 2 === 0) {");
    lines.push("      total += base + index;");
    lines.push("    } else {");
    lines.push("      total += base - index;");
    lines.push("    }");
    lines.push("  }");
    lines.push("  return total;");
  } else {
    lines.push("  switch (base % 3) {");
    lines.push("    case 0:");
    lines.push(`      return base + ${version};`);
    lines.push("    case 1:");
    lines.push("      return base * 2;");
    lines.push("    default:");
    lines.push("      return base - 1;");
    lines.push("  }");
  }

  lines.push("}");
  return lines.join("\n");
}

function simpleIndexSource(version) {
  return [
    `export const indexVersion = ${version};`,
    "export function runIndex(input: number): number {",
    "  if (input < 0) {",
    "    return 0;",
    "  }",
    "  return input + 1;",
    "}",
  ].join("\n");
}

function simpleMathSource(version) {
  return [
    `export const mathVersion = ${version};`,
    "export function calculate(value: number): number {",
    "  let total = value;",
    "  for (let index = 0; index < 3; index += 1) {",
    "    if (index % 2 === 0) {",
    "      total += index;",
    "    } else {",
    "      total -= index;",
    "    }",
    "  }",
    "  return total;",
    "}",
  ].join("\n");
}

function simpleNotesSource(version) {
  return [
    `# Simple fixture v${version}`,
    "",
    "This repository is intentionally tiny and owned by one author.",
    "It exercises reverse-chronological history, blame counts, and single-owner files.",
  ].join("\n");
}

function markdownSource(filePath, version) {
  return [
    `# ${filePath}`,
    "",
    `Fixture revision ${version}.`,
  ].join("\n");
}

function symbolName(filePath) {
  return filePath
    .replace(/^src\//, "")
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-zA-Z0-9]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.toLowerCase() : capitalize(part)))
    .join("");
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function hashPath(filePath) {
  let hash = 0;
  for (const char of filePath) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

async function writeFiles(repoPath, files) {
  for (const [filePath, content] of files.entries()) {
    const absolutePath = path.join(repoPath, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
}

async function commit(repoPath, { author, message, date }) {
  runGit(repoPath, ["add", "-A"]);
  runGit(repoPath, ["commit", "--quiet", "--no-gpg-sign", "-m", message], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date.toISOString(),
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: date.toISOString(),
  });
}

async function initRepo(repoPath) {
  await mkdir(repoPath, { recursive: true });
  runGit(repoPath, ["init"]);
  runGit(repoPath, ["branch", "-M", "main"]);
  runGit(repoPath, ["config", "user.name", "Fixture Bot"]);
  runGit(repoPath, ["config", "user.email", "fixture@example.com"]);
  runGit(repoPath, ["config", "commit.gpgsign", "false"]);
}

async function resetDirectory(repoPath) {
  await rm(repoPath, { recursive: true, force: true });
  await mkdir(repoPath, { recursive: true });
}

function runGit(repoPath, args, extraEnv = {}) {
  execFileSync("git", args, {
    cwd: repoPath,
    env: { ...process.env, ...extraEnv },
    stdio: "pipe",
  });
}

async function hasGitHistory(repoPath) {
  try {
    await stat(path.join(repoPath, ".git", "HEAD"));
    return true;
  } catch {
    return false;
  }
}

function dayMs(days) {
  return days * 24 * 60 * 60 * 1000;
}
