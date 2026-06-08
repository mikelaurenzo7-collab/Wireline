import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import { assertNoHorizontalOverflow } from "../helpers/ui";

/**
 * Authenticated dashboard — comprehensive coverage of all major app sections.
 *
 * Tests every authenticated page route renders correctly with the app shell,
 * proper heading, navigation chrome, and no layout regressions. Uses the QA
 * session for auth; tests focus on structural rendering (not data-dependent
 * assertions that need a live DB).
 */

const DASHBOARD_ROUTES: { path: string; heading: RegExp; name: string }[] = [
  { path: "/ops", heading: /live ops/i, name: "Live Ops" },
  { path: "/ops?tab=triage", heading: /live ops/i, name: "Live Ops Triage" },
  { path: "/chat", heading: /chat/i, name: "Agent Chat" },
  { path: "/phone", heading: /phone|calls/i, name: "Phone Channel" },
  { path: "/email", heading: /email|inbox/i, name: "Email Channel" },
  { path: "/sms", heading: /sms|messages/i, name: "SMS Channel" },
  { path: "/activity", heading: /activity/i, name: "Activity" },
  { path: "/training", heading: /training/i, name: "Training" },
  { path: "/knowledge", heading: /knowledge/i, name: "Knowledge Base" },
  { path: "/agents", heading: /agents|fleet/i, name: "Fleet Settings" },
  { path: "/integrations", heading: /integrations/i, name: "Integrations" },
  { path: "/appointments", heading: /appointments/i, name: "Appointments" },
  { path: "/pipeline", heading: /pipeline/i, name: "Pipeline" },
  { path: "/admin", heading: /settings|admin/i, name: "Admin Settings" },
  { path: "/dnc", heading: /do not call|dnc/i, name: "DNC Manager" },
  { path: "/audit", heading: /audit/i, name: "Audit Log" },
  { path: "/help", heading: /help/i, name: "Help Center" },
];

test.describe("Authenticated dashboard — desktop rendering", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route.path} (${route.name}) renders with heading and no overflow`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible({
        timeout: 25_000,
      });
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Authenticated dashboard — mobile rendering", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, baseURL!);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route.path} (${route.name}) renders on mobile without overflow`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible({
        timeout: 25_000,
      });
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Authenticated dashboard — tablet rendering", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await authenticatePage(page, baseURL!);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route.path} (${route.name}) renders on tablet without overflow`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible({
        timeout: 25_000,
      });
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Authenticated dashboard — navigation shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("sidebar navigation is present on desktop", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 25_000 });

    // Navigation should contain links to major sections
    const nav = page.locator("nav, [role='navigation']").first();
    await expect(nav).toBeVisible();
  });

  test("authenticated user sees account-related controls", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 25_000 });

    // User should see some form of account/settings access
    const accountControls = page.locator(
      '[data-testid*="user"], [data-testid*="account"], [data-testid*="avatar"], button[aria-label*="account" i], button[aria-label*="settings" i], button[aria-label*="profile" i]',
    );
    const hasAccountControl = (await accountControls.count()) > 0;
    // Fallback: check for a settings link
    const hasSettingsLink =
      (await page.locator('a[href="/admin"], a[href="/settings"]').count()) > 0;
    expect(hasAccountControl || hasSettingsLink).toBe(true);
  });
});

test.describe("Authenticated dashboard — page actions", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, baseURL!);
  });

  test("phone page loads and shows channel content", async ({ page }) => {
    await page.goto("/phone", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /phone|calls/i })).toBeVisible({
      timeout: 25_000,
    });
    // Phone page should have tabs or content sections
    const hasContent =
      (await page.locator("[role='tablist'], [role='tab'], table, [data-testid]").count()) > 0;
    expect(hasContent).toBe(true);
  });

  test("training page loads and shows training interface", async ({ page }) => {
    await page.goto("/training", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /training/i })).toBeVisible({
      timeout: 25_000,
    });
  });

  test("insights page loads and shows analytics surface", async ({ page }) => {
    await page.goto("/insights", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /insights/i })).toBeVisible({
      timeout: 25_000,
    });
  });
});
