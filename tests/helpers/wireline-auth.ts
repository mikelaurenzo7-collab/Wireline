import { expect, type Page } from "@playwright/test";

/** QA session used for authenticated route tests (preview / local with matching user). */
export const QA_SESSION = {
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZjM2NjIwZC0wNzRlLTQ1MjEtYTcyNi04NTA3ZDI1NDQ0ZmQiLCJlbWFpbCI6InFhLXNpZ251cC0xNzc5OTE3MDAzQHdpcmVsaW5lLWRlYnVnLnRlc3QiLCJpYXQiOjE3Nzk5MTcwMDQsImV4cCI6MTc4MDUyMTgwNCwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiaXNzIjoid2lyZWxpbmUtaW50ZXJuYWwifQ.jKdFNz9YyQjYzmNBhHkccV17hQMKm1Xqb0UlmebYePE",
  user: {
    id: "af36620d-074e-4521-a726-8507d25444fd",
    email: "qa-signup-1779917003@wireline-debug.test",
    full_name: "QA Test",
    is_owner: false,
  },
};

/**
 * Seed localStorage and reload so AuthContext hydrates before route tests.
 * A plain evaluate() without reload leaves React user state null on the first paint.
 */
export async function authenticatePage(page: Page, baseURL: string) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate((session) => {
    localStorage.setItem("wireline_session", JSON.stringify(session));
  }, QA_SESSION);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /live ops/i })).toBeVisible({
    timeout: 25_000,
  });
}
