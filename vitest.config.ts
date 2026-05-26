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
  },
});
