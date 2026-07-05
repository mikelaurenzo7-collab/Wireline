import path from "node:path";
import { defineConfig } from "vitest/config";

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
  },
});
