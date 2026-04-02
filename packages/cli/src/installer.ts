import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prepares a dashboard asset directory for serving.
 *
 * @param reportDir The report directory that will be served.
 * @returns The directory containing the dashboard entry point.
 */
export async function ensureUiBundle(reportDir: string): Promise<string> {
  const sourceDir = resolveUiSourceDir();
  const destinationDir = path.join(reportDir, "ui");

  try {
    await cp(sourceDir, destinationDir, { recursive: true });
    return destinationDir;
  } catch {
    await mkdir(reportDir, { recursive: true });
    const indexPath = path.join(reportDir, "index.html");
    await writeFile(indexPath, createFallbackHtml(), "utf8");
    return reportDir;
  }
}

/**
 * Creates a minimal dashboard HTML shell used when the built UI is absent.
 *
 * @returns A self-contained HTML document.
 */
export function createFallbackHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Strata</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background: #0d0d0d;
      color: #f3f4f6;
      min-height: 100vh;
      display: grid;
      place-items: center;
    }
    main {
      width: min(960px, calc(100vw - 32px));
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
    }
    pre {
      overflow: auto;
      background: #0a0a0a;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .muted { color: #9ca3af; }
  </style>
</head>
<body>
  <main>
    <h1>Strata report</h1>
    <p class="muted">The packaged UI build is unavailable, so this fallback view is rendering the report JSON directly.</p>
    <pre id="app">Loading report...</pre>
  </main>
  <script>
    fetch('/report.json')
      .then((response) => response.json())
      .then((report) => {
        const kpis = (report.summary?.kpis ?? [])
          .map((kpi) => \`\${kpi.label}: \${kpi.value}\`)
          .join('\\n');
        document.getElementById('app').textContent =
          \`Repo: \${report.meta?.repoName}\\nHEAD: \${report.meta?.headSha}\\n\\n\${kpis}\\n\`;
      })
      .catch((error) => {
        document.getElementById('app').textContent = String(error);
      });
  </script>
</body>
</html>`;
}

function resolveUiSourceDir(): string {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(runtimeDir, "..", "..", "ui", "dist");
}
