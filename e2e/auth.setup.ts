import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";
import { dismissCookieNotice, hasE2ECredentials, signInWithTestUser } from "./helpers/auth";

const AUTH_STATE = join(dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");

/**
 * Persists a logged-in storage state for projects that use `storageState`.
 * Skipped automatically when E2E credentials are not configured.
 */
setup("authenticate", async ({ page }) => {
  setup.skip(!hasE2ECredentials(), "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");
  mkdirSync(dirname(AUTH_STATE), { recursive: true });
  await signInWithTestUser(page);
  await dismissCookieNotice(page);
  await page.context().storageState({ path: AUTH_STATE });
});
