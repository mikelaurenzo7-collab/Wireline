import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { installMockWirelineSession } from "../helpers/mock-auth";

const OUT_DIR = path.join(process.cwd(), "test-results", "page-audit");

const AUTH_ROUTES: { path: string; file: string }[] = [
  { path: "/", file: "01-command-center-root.png" },
  { path: "/dashboard", file: "02-dashboard.png" },
  { path: "/live", file: "03-live.png" },
  { path: "/triage", file: "04-triage.png" },
  { path: "/insights", file: "05-insights.png" },
  { path: "/contact/15555550100", file: "06-contact-profile.png" },
  { path: "/logs", file: "07-call-logs.png" },
  { path: "/inbox", file: "08-email.png" },
  { path: "/outbound", file: "09-outbound.png" },
  { path: "/appointments", file: "10-appointments.png" },
  { path: "/train", file: "11-training.png" },
  { path: "/knowledge", file: "12-knowledge.png" },
  { path: "/agents", file: "13-fleet-agents.png" },
  { path: "/integrations", file: "14-integrations.png" },
  { path: "/admin", file: "15-admin-settings.png" },
  { path: "/dnc", file: "16-dnc.png" },
  { path: "/audit", file: "17-audit.png" },
  { path: "/command", file: "18-command-alt.png" },
  { path: "/this-route-should-404", file: "19-not-found.png" },
];

test.describe("Page audit — authenticated (mock session)", () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installMockWirelineSession(page);
  });

  for (const { path: routePath, file } of AUTH_ROUTES) {
    test(`screenshot ${routePath}`, async ({ page }) => {
      await page.goto(routePath, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 45_000 });
      await page.waitForTimeout(600);
      const dest = path.join(OUT_DIR, file);
      await page.screenshot({ path: dest, fullPage: true });
      expect(fs.existsSync(dest)).toBeTruthy();
    });
  }
});

test.describe("Page audit — public & login", () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test("login page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: path.join(OUT_DIR, "00-login.png"), fullPage: true });
    await context.close();
  });

  test("privacy", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/privacy|Policy/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(OUT_DIR, "20-privacy.png"), fullPage: true });
    await context.close();
  });

  test("terms", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/terms|service/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(OUT_DIR, "21-terms.png"), fullPage: true });
    await context.close();
  });
});

test.describe("Interaction smoke (mock session)", () => {
  test.beforeEach(async ({ page }) => {
    await installMockWirelineSession(page);
  });

  test("dashboard tabs switch", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 45_000 });
    await page.getByRole("button", { name: /^Brief$/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT_DIR, "22-dashboard-brief-tab.png"),
      fullPage: true,
    });
  });

  test("outbound tabs visible", async ({ page }) => {
    await page.goto("/outbound", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Dispatch/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Campaigns/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT_DIR, "23-outbound-campaigns-tab.png"),
      fullPage: true,
    });
  });

  test("rail navigation to insights", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Go to Insights/i }).click();
    await expect(page).toHaveURL(/\/insights/, { timeout: 15_000 });
    await page.screenshot({ path: path.join(OUT_DIR, "24-nav-insights.png"), fullPage: true });
  });
});
