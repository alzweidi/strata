import { average } from "../utils.js";
import type { HotspotMetric, RiskLevel } from "../types.js";
import { calculateComplexity, type ComplexityMetric } from "../static/complexity.js";
import { detectLanguageFromContent, detectLanguageFromPath } from "../static/languageDetect.js";
import { countLocFromContent } from "../static/locCounter.js";

export type HotspotInput = Readonly<{
  filePath: string;
  churnScore: number;
  content?: string;
  complexity?: number;
  lastTouched?: number;
  language?: string;
  loc?: number;
  touchCount?: number;
}>;

export type HotspotOptions = Readonly<{
  now?: number;
}>;

/**
 * Calculates hotspot metrics for a set of files.
 *
 * @param files The files to analyse.
 * @param options Optional calculation settings.
 * @returns Hotspot metrics sorted from highest to lowest risk.
 */
export function analyseHotspots(
  files: readonly HotspotInput[],
  options: HotspotOptions = {},
): HotspotMetric[] {
  if (files.length === 0) {
    return [];
  }

  const rawMetrics = files.map((file) => materializeMetric(file));
  const hotspotScores = scoreHotspots(rawMetrics);

  return rawMetrics
    .map((metric, index) => ({
      ...metric,
      hotspotScore: hotspotScores[index] ?? 0,
      riskLevel: classifyRisk(hotspotScores[index] ?? 0),
      lastTouched: metric.lastTouched || options.now || 0,
    }))
    .sort((left, right) => right.hotspotScore - left.hotspotScore || right.loc - left.loc);
}

function materializeMetric(file: HotspotInput): Omit<HotspotMetric, "hotspotScore" | "riskLevel"> {
  const language = file.language ?? detectLanguageFromContent(file.content ?? "", file.filePath);
  const loc = file.loc ?? computeLoc(file.content ?? "", language).codeLines;
  const complexity = file.complexity ?? computeComplexity(file.content ?? "", language).complexity;

  return {
    filePath: file.filePath,
    language: language === "unknown" ? detectLanguageFromPath(file.filePath) : language,
    loc,
    complexity,
    churnScore: Math.max(0, file.churnScore),
    lastTouched: file.lastTouched ?? 0,
    touchCount: file.touchCount ?? 0,
  };
}

function scoreHotspots(
  metrics: readonly Omit<HotspotMetric, "hotspotScore" | "riskLevel">[],
): number[] {
  const maxComplexity = Math.max(...metrics.map((metric) => metric.complexity), 0);
  const maxChurn = Math.max(...metrics.map((metric) => metric.churnScore), 0);

  return metrics.map((metric) => {
    const complexityNorm = maxComplexity > 0 ? metric.complexity / maxComplexity : 0;
    const churnNorm = maxChurn > 0 ? metric.churnScore / maxChurn : 0;

    return average([complexityNorm, churnNorm]) * 100;
  });
}

function classifyRisk(score: number): RiskLevel {
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

function computeComplexity(source: string, language: string): ComplexityMetric {
  return calculateComplexity(source, language);
}

function computeLoc(source: string, language: string): { codeLines: number } {
  return { codeLines: countLocFromContent(source, language).codeLines };
}
