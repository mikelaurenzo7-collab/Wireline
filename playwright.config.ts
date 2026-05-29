import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Functional end-to-end suite. Visual-regression baselines were retired —
  // these specs assert behaviour, accessibility, and layout invariants
  // (no horizontal overflow, single h1, focusable controls) rather than
  // pixel diffs, so they're stable across CI and local runs.
  testDir: "./tests/e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    // Preview deployments use Vercel's TLS cert which may not be in the CA
    // bundle of older CI runner images; ignore in preview mode only.
    ignoreHTTPSErrors: !!process.env.PLAYWRIGHT_BASE_URL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
  // No local dev server when targeting a remote URL (CI hits Vercel
  // preview). For local visual runs the dev server is started below.
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
});
