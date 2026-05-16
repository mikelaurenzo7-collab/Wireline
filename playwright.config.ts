import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;
const fullMatrix = process.env.E2E_FULL_MATRIX === "1";

const allProjects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  { name: "chromium-tablet", use: { ...devices["iPad Mini"] } },
];

/**
 * Playwright E2E configuration for Wireline
 * - Visual regression testing with screenshots
 * - User flow testing for critical paths
 * - Mobile and desktop viewport coverage
 *
 * CI defaults to **desktop Chromium only** unless `E2E_FULL_MATRIX=1` (3× runtime).
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
  projects: ci && !fullMatrix ? [allProjects[0]!] : allProjects,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
