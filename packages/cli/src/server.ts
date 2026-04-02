import { createServer, type Server, type ServerResponse } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { AddressInfo } from "node:net";

import type { ServeHandle } from "./types.js";
import { ensureUiBundle } from "./installer.js";

/**
 * Starts a local HTTP server for a Strata report directory.
 *
 * @param reportDir The directory containing the generated report.
 * @param port The preferred listening port.
 * @returns The server URL and a close handle.
 */
export async function startReportServer(
  reportDir: string,
  port: number,
): Promise<ServeHandle> {
  const assetRoot = await ensureUiBundle(reportDir);
  const server = createServer(async (request, response) => {
    const requestPath = normalizeRequestPath(request.url ?? "/");
    try {
      if (requestPath === "/report.json") {
        await sendFile(response, path.join(reportDir, "report.json"), "application/json");
        return;
      }

      const targetPath = resolveAssetPath(assetRoot, requestPath);
      if (targetPath && (await exists(targetPath))) {
        await sendFile(response, targetPath, getContentType(targetPath));
        return;
      }

      const indexPath = path.join(assetRoot, "index.html");
      await sendFile(response, indexPath, "text/html; charset=utf-8");
    } catch {
      response.statusCode = 500;
      response.end("Internal Server Error");
    }
  });

  const address = await listen(server, port);
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: async () => {
      await closeServer(server);
    },
  };
}

async function listen(server: Server, port: number): Promise<AddressInfo> {
  return await new Promise<AddressInfo>((resolve, reject) => {
    let currentPort = port;

    const tryListen = (): void => {
      server.listen(currentPort, "127.0.0.1");
    };

    const onError = (error: NodeJS.ErrnoException): void => {
      if (error.code === "EADDRINUSE" && currentPort < port + 20) {
        currentPort += 1;
        tryListen();
        return;
      }

      cleanup();
      reject(error);
    };

    const onListening = (): void => {
      cleanup();
      const address = server.address();
      if (address && typeof address !== "string") {
        resolve(address);
      } else {
        reject(new Error("Failed to determine listening address."));
      }
    };

    const cleanup = (): void => {
      server.off("error", onError);
      server.off("listening", onListening);
    };

    server.on("error", onError);
    server.on("listening", onListening);
    tryListen();
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function normalizeRequestPath(url: string): string {
  const pathname = new URL(url, "http://127.0.0.1").pathname;
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

function resolveAssetPath(assetRoot: string, requestPath: string): string | undefined {
  const safePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  if (safePath.length === 0) {
    return undefined;
  }

  const resolved = path.resolve(assetRoot, safePath);
  return resolved === assetRoot || resolved.startsWith(`${assetRoot}${path.sep}`)
    ? resolved
    : undefined;
}

async function sendFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
): Promise<void> {
  await access(filePath);
  const content = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.end(content);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
