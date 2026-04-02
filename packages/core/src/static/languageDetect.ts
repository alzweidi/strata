import path from "node:path";

import type { FileCategory } from "../types.js";

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".bash": "shell",
  ".c": "c",
  ".cc": "cpp",
  ".cfg": "ini",
  ".clj": "clojure",
  ".cljc": "clojure",
  ".cljs": "clojure",
  ".cmake": "cmake",
  ".cjs": "javascript",
  ".coffee": "coffeescript",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".cxx": "cpp",
  ".dart": "dart",
  ".env": "config",
  ".erb": "ruby",
  ".ex": "elixir",
  ".exs": "elixir",
  ".fish": "shell",
  ".go": "go",
  ".groovy": "groovy",
  ".h": "c",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".htm": "html",
  ".html": "html",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascript",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".less": "css",
  ".lua": "lua",
  ".m": "objective-c",
  ".md": "markdown",
  ".mdx": "markdown",
  ".mkd": "markdown",
  ".ml": "ocaml",
  ".mjs": "javascript",
  ".mm": "objective-c++",
  ".php": "php",
  ".pl": "perl",
  ".pm": "perl",
  ".ps1": "powershell",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".sass": "css",
  ".scala": "scala",
  ".scss": "css",
  ".sh": "shell",
  ".svelte": "svelte",
  ".swift": "swift",
  ".tcl": "tcl",
  ".tex": "tex",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".vue": "vue",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "shell",
  ".sql": "sql",
};

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".mkd", ".rst", ".txt"]);
const CONFIG_FILENAMES = new Set([
  ".editorconfig",
  ".env",
  ".eslintignore",
  ".eslintrc",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "package.json",
  "tsconfig.json",
]);

/**
 * Detects a source language from the file path when an explicit parser is not
 * available.
 *
 * @param filePath The repository-relative or absolute file path.
 * @returns A best-effort language label or `unknown`.
 */
export function detectLanguageFromPath(filePath: string): string {
  const baseName = path.posix.basename(filePath);
  const extension = path.posix.extname(baseName).toLowerCase();

  if (baseName === "Dockerfile") {
    return "dockerfile";
  }

  if (CONFIG_FILENAMES.has(baseName)) {
    return "config";
  }

  return EXTENSION_LANGUAGE_MAP[extension] ?? "unknown";
}

/**
 * Detects a source language from file contents when the file path is not
 * enough, for example for extensionless scripts.
 *
 * @param content The file contents to inspect.
 * @param filePath The file path used as a fallback hint.
 * @returns A best-effort language label or `unknown`.
 */
export function detectLanguageFromContent(
  content: string,
  filePath: string,
): string {
  const pathLanguage = detectLanguageFromPath(filePath);

  if (pathLanguage !== "unknown") {
    return pathLanguage;
  }

  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";

  if (firstLine.startsWith("#!/usr/bin/env node") || firstLine.includes("node")) {
    return "javascript";
  }

  if (firstLine.includes("python")) {
    return "python";
  }

  if (firstLine.includes("bash") || firstLine.includes("sh")) {
    return "shell";
  }

  return "unknown";
}

/**
 * Classifies a file into the report-level file category used by the LOC
 * analyser and file tree overlays.
 *
 * @param filePath The path to classify.
 * @param language The detected language, if already known.
 * @returns The best-effort file category.
 */
export function classifyFileCategory(
  filePath: string,
  language?: string,
): FileCategory {
  const lowerPath = filePath.toLowerCase();
  const baseName = path.posix.basename(lowerPath);

  if (
    lowerPath.includes("/test/") ||
    lowerPath.includes("/tests/") ||
    lowerPath.includes("__tests__/") ||
    baseName.endsWith(".spec.ts") ||
    baseName.endsWith(".spec.tsx") ||
    baseName.endsWith(".spec.js") ||
    baseName.endsWith(".spec.jsx") ||
    baseName.endsWith(".test.ts") ||
    baseName.endsWith(".test.tsx") ||
    baseName.endsWith(".test.js") ||
    baseName.endsWith(".test.jsx")
  ) {
    return "test";
  }

  if (
    lowerPath.startsWith("docs/") ||
    lowerPath.includes("/docs/") ||
    DOC_EXTENSIONS.has(path.posix.extname(baseName)) ||
    baseName === "readme" ||
    baseName.startsWith("readme.")
  ) {
    return "docs";
  }

  if (
    lowerPath.includes("/dist/") ||
    lowerPath.includes("/build/") ||
    lowerPath.includes("/coverage/") ||
    lowerPath.includes("/generated/") ||
    lowerPath.includes(".generated.") ||
    baseName.endsWith(".min.js") ||
    baseName.endsWith(".min.css")
  ) {
    return "generated";
  }

  if (
    baseName === "package.json" ||
    baseName === "tsconfig.json" ||
    baseName === "eslint.config.js" ||
    baseName.startsWith(".env") ||
    lowerPath.endsWith(".yml") ||
    lowerPath.endsWith(".yaml") ||
    lowerPath.endsWith(".toml") ||
    lowerPath.endsWith(".json") ||
    lowerPath.endsWith(".ini") ||
    lowerPath.endsWith(".cfg")
  ) {
    return "config";
  }

  if (language === "unknown") {
    return "unknown";
  }

  return "source";
}
