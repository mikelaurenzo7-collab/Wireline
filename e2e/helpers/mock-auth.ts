import type { Page } from "@playwright/test";

/** Minimal session shape matching `AuthContext` / `AuthPortal` localStorage. */
export const MOCK_WIRELINE_SESSION = {
  access_token: "playwright-e2e-mock-token",
  user: {
    id: "usr_playwright_e2e",
    email: "playwright-e2e@wireline.local",
    full_name: "Playwright E2E",
    role: "owner",
  },
} as const;

/** Inject before first navigation so React sees an authenticated user (no real Supabase call). */
export async function installMockWirelineSession(page: Page): Promise<void> {
  await page.addInitScript((raw: string) => {
    try {
      const s = JSON.parse(raw) as typeof MOCK_WIRELINE_SESSION;
      localStorage.setItem("wireline_session", JSON.stringify(s));
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
    } catch {
      /* ignore */
    }
  }, JSON.stringify(MOCK_WIRELINE_SESSION));
}
