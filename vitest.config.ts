import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests under src/ plus the integration suites under tests/integration
    // (tenant-isolation, escalation rate limiting). Playwright e2e specs live
    // in tests/e2e with a .spec.ts extension and are intentionally excluded so
    // they are not double-collected by vitest.
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
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
      // the 2026-Q2 test expansion (406 tests), then again after the
      // webhook-signature + auth/RBAC suite landed (794 tests; measured
      // ~11.9% stmts / 65.5% branches / 33.7% funcs).
      //
      // Keep a generous margin below the measured values (local: ~11.9%
      // stmts / 65% branches / 33% funcs). v8's accounting can drift between
      // environments, and importing large, mostly-uncovered route files
      // (e.g. meta-webhook-routes.ts) shifts the denominator — so we stay well
      // clear of the floor. These are still strictly above the prior baseline
      // (6/50/20/6), so they remain a regression guard, not a flaky gate.
      thresholds: {
        statements: 8,
        branches: 55,
        functions: 25,
        lines: 8,
      },
    },
  },
});
