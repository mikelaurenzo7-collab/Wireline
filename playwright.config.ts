import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Test dir is now the parent of both `e2e` and `visual` so a single
  // `playwright test` invocation covers both. The npm scripts add a
  // --grep filter when a specific suite is wanted (test:visual, test:e2e).
  testDir: "./tests",
  testMatch: ["**/e2e/**/*.spec.ts", "**/visual/**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  // Snapshot baselines live next to the spec for easy review on PR.
  snapshotPathTemplate: "{testDir}/visual/__snapshots__/{testFilePath}/{arg}{ext}",
  // Pixel-diff threshold for `toHaveScreenshot()` calls that don't
  // override it themselves. Tight enough to catch real chrome regressions
  // (rail overlap, missing breadcrumb, broken empty state) without
  // flaking on sub-pixel font jitter.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      // Caret blink, scroll indicators, etc. — let Playwright soft-disable.
      caret: "hide",
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
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
