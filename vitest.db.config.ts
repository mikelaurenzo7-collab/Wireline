import path from "node:path";
import { defineConfig } from "vitest/config";

// The real-database lane: tests/db/** against a disposable local Postgres
// prepared by scripts/prepare-test-database.mjs. The app's own pool reads
// POSTGRES_URL, so it is pointed at that database before any import.
process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL || "";
delete process.env.DATABASE_URL;
// The pool prefers DATABASE_POOL_URL over POSTGRES_URL. A shell that exports
// production credentials would otherwise send these tests, which write, to
// production while the prepare step was pointed at the local database.
delete process.env.DATABASE_POOL_URL;
// The same rule scripts/prepare-test-database.mjs applies before it runs.
const testDatabaseHost = (() => {
  try {
    return new URL(process.env.POSTGRES_URL || "").hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(testDatabaseHost)) {
  throw new Error(
    "TEST_DATABASE_URL must point at a local database, for example postgres://postgres@127.0.0.1:55432/wireline_test.",
  );
}

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
