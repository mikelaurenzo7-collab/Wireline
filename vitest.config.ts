import path from "node:path";
import { defineConfig } from "vitest/config";

// Import-only tests construct the shared database pool but never connect to it.
// Keep the suite hermetic when CI or a fresh checkout has no production secrets.
process.env.POSTGRES_URL ??= "postgresql://wireline:wireline@127.0.0.1:5432/wireline";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/src", replacement: path.resolve(__dirname, "src") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  test: {
    environment: "node",
    pool: "vmThreads",
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**", ".worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 1,
        functions: 1,
        branches: 1,
        statements: 1,
      },
    },
  },
});
