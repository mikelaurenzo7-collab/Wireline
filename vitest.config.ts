import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only pick up unit tests under src/ so Playwright e2e specs under tests/
    // are not double-collected by vitest.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: false,
    // Keep server bundling tools out of the way during unit runs.
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Ratchet thresholds: set just below the current measured floor so the
      // build fails on a coverage *regression* rather than enforcing an
      // aspirational target the legacy UI tree can't yet meet. Raised after
      // the 2026-Q2 test expansion (406 tests).
      thresholds: {
        statements: 6,
        branches: 50,
        functions: 20,
        lines: 6,
      },
    },
  },
});
