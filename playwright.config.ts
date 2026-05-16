import { defineConfig, devices } from "@playwright/test";

function hasE2ECredentials(): boolean {
  const email = process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD;
  return Boolean(email && password);
}

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const AUTH_STATE = "e2e/.auth/user.json";

/** Start Vite+Express locally unless targeting a remote deployment. */
const useLocalWebServer =
  baseURL.includes("localhost") ||
  baseURL.includes("127.0.0.1") ||
  process.env.E2E_FORCE_LOCAL_SERVER === "1";

/**
 * Playwright E2E configuration for Wireline
 * - `chromium` / `chromium-mobile` / `chromium-tablet`: unauthenticated flows, login tests, public pages
 * - `setup` + `chromium-authed`: reuse a saved session (requires E2E_USER_EMAIL + E2E_USER_PASSWORD)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    ...(hasE2ECredentials()
      ? [
          {
            name: "setup",
            testMatch: /auth\.setup\.ts/,
          },
          {
            name: "chromium-authed",
            dependencies: ["setup"],
            testMatch: /.*\.spec\.ts/,
            grep: /@auth-desktop/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: AUTH_STATE,
            },
          },
        ]
      : []),
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      grepInvert: /@auth-desktop/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      testMatch: /.*\.spec\.ts/,
      grepInvert: /@auth-desktop|@desktop-only/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "chromium-tablet",
      testMatch: /.*\.spec\.ts/,
      grepInvert: /@auth-desktop|@desktop-only/,
      use: { ...devices["iPad Mini"] },
    },
  ],
  webServer: useLocalWebServer
    ? {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        // Child server must not inherit CI/VERCEL/CORS from the parent shell — that
        // enables strict CORS and breaks Vite HMR requests from http://localhost:3000.
        env: {
          ...process.env,
          NODE_ENV: "development",
          VERCEL: "",
          CORS_ORIGINS: "",
        },
      }
    : undefined,
});
