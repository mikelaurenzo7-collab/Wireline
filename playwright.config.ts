import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === "1" ? "all" : "none",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    // Sandboxes with a preinstalled Chromium can point at it instead of
    // downloading a browser (e.g. /opt/pw-browsers/chromium).
    ...(process.env.WIRELINE_E2E_CHROMIUM
      ? { launchOptions: { executablePath: process.env.WIRELINE_E2E_CHROMIUM } }
      : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "design-gold",
      testMatch: /design-gold-screens\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
