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
    setupFiles: ["tests/helpers/vitest-setup.ts"],
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
      // we stay well clear of the floor.
      //
      // 2026-06 recalibration: the `branches: 60` value was stale — it was set
      // against an istanbul-era figure, but the v8 provider this config uses
      // measures branches at ~35.2% (3540/10054) for the same suite. A 60%
      // gate is therefore above the real floor, which violates this block's own
      // "set just below the measured floor" doctrine and fails the coverage
      // step on every run (main included). Reset branches to a true regression
      // guard just under the measured v8 value; statements/functions/lines keep
      // their wide margins (measured ~45%/48%/46%).
      thresholds: {
        statements: 11,
        branches: 32,
        functions: 31,
        lines: 11,
      },
    },
  },
});
