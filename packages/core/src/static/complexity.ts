import { countDecisionNodes, stripSource, type TreeLike } from "./treeSitter.js";

export type ComplexityMetric = Readonly<{
  decisionPoints: number;
  complexity: number;
  functions: number;
}>;

const FUNCTION_PATTERNS: Record<string, readonly RegExp[]> = {
  c: [/\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  csharp: [/\b(?:async\s+)?(?:public|private|protected|internal)?\s*[\w<>\[\],?\s]+\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  cpp: [/\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  go: [/\bfunc\s+[A-Za-z_]\w*\s*\(/g, /\bfunc\s*\(/g],
  java: [/\b(?:public|private|protected|static|final|synchronized|\s)*[\w<>\[\],?\s]+\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  javascript: [/\bfunction\s+[A-Za-z_]\w*\s*\(/g, /=>/g],
  kotlin: [/\bfun\s+[A-Za-z_]\w*\s*\(/g],
  php: [/\bfunction\s+[A-Za-z_]\w*\s*\(/g],
  python: [/\bdef\s+[A-Za-z_]\w*\s*\(/g],
  ruby: [/\bdef\s+[A-Za-z_]\w*\b/g],
  rust: [/\bfn\s+[A-Za-z_]\w*\s*\(/g],
  shell: [/^\s*[A-Za-z_]\w*\s*\(\)\s*\{/gm],
  "objective-c": [/\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  "objective-c++": [/\b[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{/g],
  typescript: [/\bfunction\s+[A-Za-z_]\w*\s*\(/g, /=>/g],
};

const DECISION_PATTERNS = [
  /\bcatch\b/g,
  /\bcase\b/g,
  /\belse\s+if\b/g,
  /\bfor\b/g,
  /\bif\b/g,
  /\bswitch\b/g,
  /\bthrow\b/g,
  /\bwhen\b/g,
  /\bwhile\b/g,
  /&&/g,
  /\|\|/g,
  /\?/g,
];

/**
 * Measures cyclomatic complexity and supporting counts for a source file.
 *
 * @param source The file contents to analyse.
 * @param language The detected language label, if known.
 * @param tree An optional syntax tree for higher-fidelity counting.
 * @returns Complexity metrics suitable for hotspot analysis.
 */
export function calculateComplexity(
  source: string,
  language?: string,
  tree?: TreeLike | null,
): ComplexityMetric {
  const decisionPoints = tree ? countDecisionNodes(tree) : countDecisionTokens(source);

  return {
    decisionPoints,
    complexity: decisionPoints + 1,
    functions: countFunctions(source, language),
  };
}

function countDecisionTokens(source: string): number {
  const sanitized = stripSource(source);
  let total = 0;

  for (const pattern of DECISION_PATTERNS) {
    total += countMatches(sanitized, pattern);
  }

  return total;
}

function countFunctions(source: string, language?: string): number {
  const sanitized = stripSource(source);
  const defaultPatterns: readonly RegExp[] = FUNCTION_PATTERNS.javascript ?? [];
  const patterns: readonly RegExp[] = language
    ? FUNCTION_PATTERNS[language as keyof typeof FUNCTION_PATTERNS] ??
      defaultPatterns
    : defaultPatterns;

  return patterns.reduce((total, pattern) => total + countMatches(sanitized, pattern), 0);
}

function countMatches(source: string, pattern: RegExp): number {
  const cloned = new RegExp(pattern.source, pattern.flags);
  let count = 0;

  for (const _match of source.matchAll(cloned)) {
    count += 1;
  }

  return count;
}
