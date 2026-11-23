import path from "node:path";
import { defineConfig } from "vitest/config";

// The real-database lane: tests/db/** against a disposable local Postgres
// prepared by scripts/prepare-test-database.mjs. The app's own pool reads
// POSTGRES_URL, so it is pointed at that database before any import.
process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL || "";
delete process.env.DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/src", replacement: path.resolve(__dirname, "src") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    pool: "forks",
    // One shared database: run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
