import { fileURLToPath } from "node:url";
import path from "node:path";

import { defineConfig } from "vitest/config";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, "..");

export default defineConfig({
  resolve: {
    alias: {
      "@strata/core": path.join(repoRoot, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      path.join(testsDir, "integration/**/*.test.ts"),
    ],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
