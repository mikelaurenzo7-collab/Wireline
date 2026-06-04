import { expect, type Page } from "@playwright/test";
import { signTestJwt } from "./sign-test-jwt";

const DEFAULT_E2E_USER = {
  id: "af36620d-074e-4521-a726-8507d25444fd",
  email: "qa-signup-1779917003@wireline-debug.test",
};

/**
 * Establish an httpOnly session cookie, then reload so AuthContext hydrates
 * from GET /api/auth/session.
 *
 * Prefer E2E_USER_EMAIL + E2E_USER_PASSWORD (sign-in). Otherwise signs a
 * short-lived JWT at runtime using INTERNAL_JWT_SECRET — never committed.
 */
export async function authenticatePage(page: Page, baseURL: string) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD;
  if (email && password) {
    const signin = await page.request.post(`${baseURL}/api/auth/signin`, {
      data: { email, password },
    });
    expect(signin.ok()).toBeTruthy();
  } else {
    const secret = process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "";
    if (secret.length < 32) {
      throw new Error(
        "E2E auth requires E2E_USER_EMAIL/E2E_USER_PASSWORD or INTERNAL_JWT_SECRET (32+ chars) in the environment.",
      );
    }
    const user = {
      id: process.env.E2E_USER_ID?.trim() || DEFAULT_E2E_USER.id,
      email: email || DEFAULT_E2E_USER.email,
    };
    const token = signTestJwt(user, secret);
    const migrate = await page.request.post(`${baseURL}/api/auth/migrate-session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(migrate.ok()).toBeTruthy();
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /live ops/i })).toBeVisible({
    timeout: 25_000,
  });
}
