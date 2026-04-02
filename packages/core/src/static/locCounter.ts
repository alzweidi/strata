import type { FileCategory } from "../types.js";
import { classifyFileCategory, detectLanguageFromPath } from "./languageDetect.js";

type CommentSyntax = Readonly<{
  line: readonly string[];
  block: readonly (readonly [string, string])[];
}>;

export type LocCounts = Readonly<{
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
}>;

const DEFAULT_SYNTAX: CommentSyntax = {
  line: ["//", "#", "--"],
  block: [["/*", "*/"], ["<!--", "-->"], ["'''", "'''"], ['"""', '"""']],
};

const LANGUAGE_SYNTAX: Record<string, CommentSyntax> = {
  c: { line: ["//", "#"], block: [["/*", "*/"]] },
  csharp: { line: ["//", "#"], block: [["/*", "*/"]] },
  cpp: { line: ["//", "#"], block: [["/*", "*/"]] },
  css: { line: ["/*"], block: [["/*", "*/"]] },
  html: { line: ["<!--"], block: [["<!--", "-->"]] },
  ini: { line: [";", "#"], block: [] },
  "objective-c": { line: ["//", "#"], block: [["/*", "*/"]] },
  "objective-c++": { line: ["//", "#"], block: [["/*", "*/"]] },
  java: { line: ["//", "#"], block: [["/*", "*/"]] },
  javascript: { line: ["//", "#"], block: [["/*", "*/"]] },
  kotlin: { line: ["//", "#"], block: [["/*", "*/"]] },
  markdown: { line: ["<!--"], block: [["<!--", "-->"]] },
  objective: { line: ["//", "#"], block: [["/*", "*/"]] },
  php: { line: ["//", "#"], block: [["/*", "*/"]] },
  python: { line: ["#"], block: [['"""', '"""'], ["'''", "'''"]] },
  ruby: { line: ["#"], block: [] },
  rust: { line: ["//", "#"], block: [["/*", "*/"]] },
  shell: { line: ["#"], block: [] },
  sql: { line: ["--"], block: [["/*", "*/"]] },
  typescript: { line: ["//", "#"], block: [["/*", "*/"]] },
  xml: { line: ["<!--"], block: [["<!--", "-->"]] },
  yaml: { line: ["#"], block: [] },
};

/**
 * Counts blank, comment, and code lines for a source file.
 *
 * @param content The file contents to inspect.
 * @param language The detected language label, if known.
 * @returns The line-count breakdown for the file.
 */
export function countLocFromContent(content: string, language?: string): LocCounts {
  const syntax = resolveSyntax(language);
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.length === 0 ? [] : normalized.split("\n");
  if (normalized.endsWith("\n") && lines.length > 0) {
    lines.pop();
  }
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let inBlockComment = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      blankLines += 1;
      continue;
    }

    if (inBlockComment) {
      commentLines += 1;
      if (endsBlockComment(line, syntax)) {
        inBlockComment = false;
      }

      continue;
    }

    if (startsWithComment(line, syntax.line)) {
      commentLines += 1;
      continue;
    }

    const blockComment = findBlockComment(line, syntax.block);

    if (blockComment) {
      if (blockComment.onlyComment) {
        commentLines += 1;
      } else {
        codeLines += 1;
      }

      if (!blockComment.endedOnLine) {
        inBlockComment = true;
      }

      continue;
    }

    codeLines += 1;
  }

  return {
    totalLines: lines.length,
    codeLines,
    commentLines,
    blankLines,
  };
}

/**
 * Classifies a file and counts LOC in a single pass.
 *
 * @param filePath The file path being measured.
 * @param content The file contents to count.
 * @returns The line-count breakdown plus category metadata.
 */
export function countCategorizedLoc(
  filePath: string,
  content: string,
): LocCounts & { category: FileCategory; language: string } {
  const language = detectLanguageFromPath(filePath);
  const counts = countLocFromContent(content, language);

  return {
    ...counts,
    category: classifyFileCategory(filePath, language),
    language,
  };
}

function resolveSyntax(language?: string): CommentSyntax {
  if (!language) {
    return DEFAULT_SYNTAX;
  }

  return LANGUAGE_SYNTAX[language] ?? DEFAULT_SYNTAX;
}

function startsWithComment(line: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => line.startsWith(prefix));
}

function endsBlockComment(line: string, syntax: CommentSyntax): boolean {
  return syntax.block.some(([, end]) => line.includes(end));
}

function findBlockComment(
  line: string,
  blocks: readonly (readonly [string, string])[],
): { endedOnLine: boolean; onlyComment: boolean } | undefined {
  for (const [start, end] of blocks) {
    const startIndex = line.indexOf(start);

    if (startIndex < 0) {
      continue;
    }

    const endIndex = line.indexOf(end, startIndex + start.length);
    const before = line.slice(0, startIndex).trim();
    const after = endIndex >= 0 ? line.slice(endIndex + end.length).trim() : "";

    return {
      endedOnLine: endIndex >= 0,
      onlyComment: before.length === 0 && after.length === 0,
    };
  }

  return undefined;
}
