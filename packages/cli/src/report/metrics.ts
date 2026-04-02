import path from "node:path";

import type {
  AgeBucket,
  AgeMetric,
  AuthorOwnership,
  BusFactorMetric,
  FileCategory,
  HotspotMetric,
  LocMetric,
  RiskLevel,
} from "@strata/core";

import { clamp, median } from "@strata/core";

import type { FileTouchStats } from "../git.js";
import type { FileComputation, ReportBuildContext } from "./shared.js";

/**
 * Computes the per-file metrics needed to build a Strata report.
 *
 * @param context The report build context.
 * @returns The derived file metrics.
 */
export function computeFileMetrics(context: ReportBuildContext): FileComputation[] {
  const raw = context.snapshot.trackedFiles.map((filePath) => {
    const text = context.snapshot.fileTexts.get(filePath) ?? "";
    const touchStats = context.snapshot.touchStats.get(filePath);
    return computeSingleFile(filePath, text, touchStats, context.snapshot.authorLastActive);
  });

  const complexityValues = raw.map((entry) => entry.complexity);
  const churnValues = raw.map((entry) => entry.hotspot.churnScore);
  const complexityMin = Math.min(...complexityValues, 0);
  const complexityMax = Math.max(...complexityValues, 1);
  const churnMin = Math.min(...churnValues, 0);
  const churnMax = Math.max(...churnValues, 1);

  return raw.map((entry) => {
    const complexityNorm = normalize(entry.complexity, complexityMin, complexityMax);
    const churnNorm = normalize(entry.hotspot.churnScore, churnMin, churnMax);
    const hotspotScore = clamp((complexityNorm * 0.5 + churnNorm * 0.5) * 100, 0, 100);
    const riskLevel = scoreToRisk(hotspotScore);
    return {
      ...entry,
      hotspot: { ...entry.hotspot, hotspotScore, riskLevel },
    };
  });
}

function computeSingleFile(
  filePath: string,
  text: string,
  touchStats: FileTouchStats | undefined,
  authorLastActive: Map<string, number>,
): FileComputation {
  const loc = buildLocMetric(filePath, text);
  const complexity = countComplexity(text);
  const churnScore = touchStats ? touchStats.totalInsertions + touchStats.totalDeletions : 0;
  const hotspot: HotspotMetric = {
    filePath,
    language: loc.language,
    loc: loc.codeLines,
    complexity,
    churnScore,
    hotspotScore: 0,
    riskLevel: "low",
    lastTouched: touchStats?.lastChanged ?? 0,
    touchCount: touchStats?.totalCommits ?? 0,
  };
  const busFactor = buildBusFactorMetric(filePath, loc, touchStats, authorLastActive);
  const age = buildAgeMetric(filePath, loc, touchStats);
  return { loc, complexity, hotspot, busFactor, age };
}

function buildLocMetric(filePath: string, text: string): LocMetric {
  const language = detectLanguage(filePath);
  const category = detectCategory(filePath, language);
  const lines = text.length === 0 ? [] : text.split(/\r?\n/);
  let commentLines = 0;
  let blankLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankLines += 1;
      continue;
    }

    if (isCommentLine(trimmed)) {
      commentLines += 1;
    }
  }

  const totalLines = lines.length;
  const codeLines = Math.max(totalLines - commentLines - blankLines, 0);
  return {
    filePath,
    language,
    category,
    totalLines,
    codeLines,
    commentLines,
    blankLines,
    commentRatio: codeLines === 0 ? 0 : commentLines / codeLines,
  };
}

function buildBusFactorMetric(
  filePath: string,
  loc: LocMetric,
  touchStats: FileTouchStats | undefined,
  authorLastActive: Map<string, number>,
): BusFactorMetric {
  if (!touchStats || touchStats.authorCounts.size === 0) {
    return { filePath, busFactor: 0, owners: [], orphanRisk: false };
  }

  const authorCounts = Array.from(touchStats.authorCounts.entries()) as Array<[string, number]>;
  const total = authorCounts.reduce((sum, [, count]) => sum + count, 0);
  const owners: AuthorOwnership[] = authorCounts
    .map(([author, count]) => {
      const percentOwned = total === 0 ? 0 : (count / total) * 100;
      return {
        author,
        email: touchStats.authorEmails.get(author) ?? "",
        linesOwned: Math.round((percentOwned / 100) * loc.codeLines),
        percentOwned,
        lastActive: authorLastActive.get(author) ?? 0,
      };
    })
    .sort((left, right) => right.percentOwned - left.percentOwned);

  let running = 0;
  let busFactor = 0;
  for (const owner of owners) {
    running += owner.percentOwned;
    busFactor += 1;
    if (running > 50) {
      break;
    }
  }

  const primaryOwner = owners[0];
  const orphanRisk = primaryOwner
    ? Date.now() - primaryOwner.lastActive > 90 * 24 * 60 * 60 * 1000
    : false;

  return { filePath, busFactor, owners, orphanRisk };
}

function buildAgeMetric(
  filePath: string,
  loc: LocMetric,
  touchStats: FileTouchStats | undefined,
): AgeMetric {
  const now = Date.now();
  const ages = touchStats ? [touchStats.firstSeen, touchStats.lastChanged] : [now, now];
  const ageDays = ages.map((timestamp) => Math.max(0, (now - timestamp) / 86_400_000));
  const oldest = Math.max(...ageDays, 0);
  const newest = Math.min(...ageDays, 0);

  return {
    filePath,
    medianLineAgeDays: median(ageDays),
    oldestLineAgeDays: oldest,
    newestLineAgeDays: newest,
    ageDistribution: buildAgeBuckets(loc.codeLines, ageDays),
    stableZones:
      oldest > 180 ? [{ startLine: 1, endLine: Math.max(1, loc.codeLines), ageDays: oldest }] : [],
  };
}

function buildAgeBuckets(lineCount: number, ageDays: readonly number[]): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { label: "0-7d", minDays: 0, maxDays: 7, lineCount: 0 },
    { label: "7-30d", minDays: 7, maxDays: 30, lineCount: 0 },
    { label: "30-90d", minDays: 30, maxDays: 90, lineCount: 0 },
    { label: "90d+", minDays: 90, lineCount: 0 },
  ];

  const averageAge =
    ageDays.length === 0 ? 0 : ageDays.reduce((sum, value) => sum + value, 0) / ageDays.length;
  const bucket = buckets.find((entry) => averageAge >= entry.minDays && (entry.maxDays === undefined || averageAge < entry.maxDays));
  if (bucket) {
    bucket.lineCount = lineCount;
  }

  return buckets;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function countComplexity(text: string): number {
  const tokens = text.match(/\b(if|for|while|case|catch|switch|else\s+if)\b/g) ?? [];
  const operators = (text.match(/&&|\|\||\?/g) ?? []).length;
  const functions = (text.match(/\bfunction\b|\bfn\b|=>/g) ?? []).length;
  return Math.max(1, tokens.length + operators + functions);
}

function detectLanguage(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  switch (extension) {
    case ".ts":
    case ".tsx":
      return "TypeScript";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "JavaScript";
    case ".jsx":
      return "JSX";
    case ".json":
      return "JSON";
    case ".md":
    case ".mdx":
      return "Markdown";
    case ".css":
      return "CSS";
    case ".html":
      return "HTML";
    case ".go":
      return "Go";
    case ".rs":
      return "Rust";
    case ".py":
      return "Python";
    case ".sh":
      return "Shell";
    default:
      return "Unknown";
  }
}

function detectCategory(filePath: string, language: string): FileCategory {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes("/test/") || /\.test\./.test(lowerPath) || /\.spec\./.test(lowerPath)) {
    return "test";
  }

  if (language === "Markdown" || lowerPath.endsWith(".md")) {
    return "docs";
  }

  if (
    lowerPath.endsWith(".json") ||
    lowerPath.endsWith(".yaml") ||
    lowerPath.endsWith(".yml") ||
    lowerPath.endsWith(".toml") ||
    lowerPath.endsWith(".ini") ||
    lowerPath.endsWith(".env")
  ) {
    return "config";
  }

  if (lowerPath.includes("generated") || lowerPath.includes("dist/") || lowerPath.endsWith(".min.js")) {
    return "generated";
  }

  if (language === "Unknown") {
    return "unknown";
  }

  return "source";
}

function isCommentLine(line: string): boolean {
  return (
    line.startsWith("//") ||
    line.startsWith("#") ||
    line.startsWith("/*") ||
    line.startsWith("*") ||
    line.startsWith("--") ||
    line.startsWith("<!--")
  );
}

function scoreToRisk(score: number): RiskLevel {
  if (score > 75) {
    return "critical";
  }

  if (score > 50) {
    return "high";
  }

  if (score > 25) {
    return "medium";
  }

  return "low";
}
