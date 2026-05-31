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
      // webhook-signature + auth/RBAC suite landed (794 tests), and again
      // after the route/authz expansion (850+ tests; measured ~12.5% stmts /
      // 65% branches / 33.5% funcs) added platform-admin + agent-routes tests.
      //
      // Keep a generous margin below the measured values. v8's accounting can
      // drift between environments, and importing large, mostly-uncovered
      // route files (e.g. meta-webhook-routes.ts) shifts the denominator — so
      // we stay well clear of the floor. These remain strictly above the prior
      // baseline (8/55/25/8), so they are a regression guard, not a flaky gate.
      thresholds: {
        statements: 10,
        branches: 60,
        functions: 30,
        lines: 10,
      },
    },
  },
});
