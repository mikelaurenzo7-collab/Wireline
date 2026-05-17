import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/** When `.env.local` exists (e.g. from `vercel env pull`), let the dev server load DB/CORS from it. */
const hasVercelPulledEnv = existsSync(".env.local");

/**
 * Playwright E2E configuration for Wireline
 * - Visual regression testing with screenshots
 * - User flow testing for critical paths
 * - Mobile and desktop viewport coverage
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "chromium-tablet",
      use: { ...devices["iPad Mini"] },
    },
  ],
  webServer: {
    // With Vercel-pulled `.env.local`, use normal dev; otherwise strip inherited
    // bad POSTGRES_URL / CORS from the parent shell (AGENTS.md).
    command: hasVercelPulledEnv ? "npm run dev" : "env -u POSTGRES_URL -u CORS_ORIGINS npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
