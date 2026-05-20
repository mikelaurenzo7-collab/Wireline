import { defineConfig, devices } from "@playwright/test";
import { buildPlaywrightWebServerEnv } from "./scripts/playwright-env";

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
    command: "npm run dev",
    env: buildPlaywrightWebServerEnv(),
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
