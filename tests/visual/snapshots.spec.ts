/**
 * tests/visual/snapshots.spec.ts
 * ----------------------------------------------------------------------
 * Visual-regression baselines for Wireline. Catches chrome bugs (like
 * the Aurora-rail content-overlap that shipped to prod undetected)
 * BEFORE they reach the live site by failing CI on any visible diff
 * against the committed baseline images.
 *
 * Coverage:
 *   - 5 critical routes: /, /signup, /pricing, /triage, /cockpit
 *   - 3 viewports: mobile (390×844), tablet (768×1024), desktop (1440×900)
 *   = 15 baselines per CI run
 *
 * Engine:
 *   - Playwright's native `toHaveScreenshot()` — baselines committed to
 *     `tests/visual/__snapshots__/` (in-repo, no Percy/Chromatic SaaS bill).
 *   - Single chromium browser → deterministic across CI/local.
 *   - 0.2% pixel-diff threshold (Playwright default).
 *
 * Stability:
 *   - Dynamic content (timestamps, live-call counts, "next sweep in X")
 *     is masked via `mask: locator` to keep baselines stable.
 *   - Animations frozen via `animations: "disabled"` so the wireline-aurora
 *     breathing blobs don't flake baselines.
 *   - Auth-gated routes inject a test JWT into localStorage — same
 *     pattern as the manual QA harness.
 *
 * Running:
 *   - First time / accepting changes: `npm run test:visual:update`
 *   - Verifying current code:         `npm run test:visual`
 *   - In CI (PR check):               same as verify; failure blocks merge
 */
import { test, expect, type Page } from "@playwright/test";

// ── Test fixture: a long-lived JWT for the QA user. The user exists in
//    production (created by an earlier QA run) — we ONLY use it against
//    a Vercel preview URL, never prod. For local runs it's a no-op
//    because the page won't recognize a foreign JWT.
const QA_SESSION = {
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZjM2NjIwZC0wNzRlLTQ1MjEtYTcyNi04NTA3ZDI1NDQ0ZmQiLCJlbWFpbCI6InFhLXNpZ251cC0xNzc5OTE3MDAzQHdpcmVsaW5lLWRlYnVnLnRlc3QiLCJpYXQiOjE3Nzk5MTcwMDQsImV4cCI6MTc4MDUyMTgwNCwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiaXNzIjoid2lyZWxpbmUtaW50ZXJuYWwifQ.jKdFNz9YyQjYzmNBhHkccV17hQMKm1Xqb0UlmebYePE",
  user: {
    id: "af36620d-074e-4521-a726-8507d25444fd",
    email: "qa-signup-1779917003@wireline-debug.test",
    full_name: "QA Test",
    is_owner: false,
  },
};

// Three viewports — phone, tablet, desktop. Names match the breakpoints
// in tailwind.config.js so naming stays uniform across the codebase.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

// Routes — same five the audit flagged as highest-leverage chrome surfaces.
// `auth=true` flips the localStorage JWT inject so the SPA renders signed-in
// chrome instead of bouncing to /signin.
const ROUTES = [
  { path: "/", name: "home", auth: false },
  { path: "/signup", name: "signup", auth: false },
  { path: "/pricing", name: "pricing", auth: false },
  { path: "/triage", name: "triage", auth: true },
  { path: "/cockpit", name: "cockpit", auth: true },
] as const;

/**
 * Inject the QA session before the SPA boots so it skips the auth-portal
 * and renders the authed shell. Mirrors the localStorage shape from
 * AuthContext.signIn.
 */
async function authenticate(page: Page, baseURL: string) {
  // First navigate to the origin so localStorage.setItem operates on the
  // correct domain — Playwright's `addInitScript` would run pre-navigation
  // and miss the origin in some Vercel-preview configurations.
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate((session) => {
    localStorage.setItem("wireline_session", JSON.stringify(session));
  }, QA_SESSION);
}

/**
 * Locators for dynamic content that must be masked so baseline diffs
 * are stable across runs. Includes:
 *   - Live phone pulse counts ("Live · 3")
 *   - Tier badge usage strings ("1,247 / 5,000")
 *   - Timestamp eyebrows ("2 min ago", "Today's Inbox · 12 items")
 *   - Aurora animations (frozen via `animations: "disabled"` but the
 *     RAIL gradient blobs sometimes flake; mask as belt-and-suspenders)
 */
function dynamicMasks(page: Page) {
  return [
    page.locator('[data-testid="live-pulse-count"]'),
    page.locator('[data-testid="tier-usage-text"]'),
    page.locator('[data-testid="triage-grid"] [data-testid$="-timestamp"]'),
    page.locator("text=/\\d+\\s+(min|hour|day)s?\\s+ago/i"),
    page.locator(".wireline-aurora-a, .wireline-aurora-b"),
  ];
}

// One test per (route × viewport). Splitting them yields cleaner diffs
// in the report and lets a single regression fail in isolation.
for (const route of ROUTES) {
  test.describe(`visual: ${route.name}`, () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name} (${viewport.width}×${viewport.height})`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        if (route.auth) {
          await authenticate(page, baseURL!);
        }
        await page.goto(route.path, { waitUntil: "networkidle" });

        // Settle: give Framer Motion mount animations + the Suspense
        // boundary a beat to resolve before snapshotting.
        await page.waitForTimeout(900);

        // Dismiss the cookie banner so it doesn't dominate every baseline.
        const cookieDismiss = page.locator(
          "button[aria-label*='cookies' i], button[aria-label*='accept' i]",
        );
        if (await cookieDismiss.count()) {
          await cookieDismiss
            .first()
            .click()
            .catch(() => undefined);
          await page.waitForTimeout(200);
        }

        await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
          fullPage: false,
          animations: "disabled",
          // Per-pixel difference threshold. Playwright's default is
          // 0.2 (0.2%). Tight enough to catch the rail-overlap bug,
          // loose enough to tolerate sub-pixel font rendering jitter.
          maxDiffPixelRatio: 0.002,
          mask: dynamicMasks(page),
          // Stable masking color = brand purple so masks visibly
          // belong to Wireline if a human is reviewing the diff.
          maskColor: "#4F1E7B",
        });
      });
    }
  });
}
