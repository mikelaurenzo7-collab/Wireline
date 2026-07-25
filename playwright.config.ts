import { defineConfig, devices } from "@playwright/test";
import { resolvePreinstalledChromium } from "./scripts/lib/resolve-preinstalled-chromium.mjs";

const preinstalledChromium = resolvePreinstalledChromium();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The local production server does cold lazy-route work; serial workers avoid
  // first-wave navigation timeouts that do not reproduce once the app is warm.
  workers: 1,
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === "1" ? "all" : "none",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    // Sandboxes with a preinstalled Chromium (and browser downloads disabled)
    // point at it automatically; WIRELINE_E2E_CHROMIUM still overrides. CI and
    // local installs resolve browsers through Playwright as usual.
    ...(preinstalledChromium ? { launchOptions: { executablePath: preinstalledChromium } } : {}),
  },
  projects: [
    {
      name: "chromium",
      // Design-gold screenshots belong only to the design-gold project.
      testIgnore: /design-gold-screens\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "design-gold",
      testMatch: /design-gold-screens\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "npm run build && node -e \"process.env.PORT='3000'; process.env.VERCEL='0'; process.env.NODE_ENV='production'; process.env.POSTGRES_URL ||= 'postgresql://wireline:wireline@127.0.0.1:5432/wireline'; require('./dist/server.cjs')\"",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
