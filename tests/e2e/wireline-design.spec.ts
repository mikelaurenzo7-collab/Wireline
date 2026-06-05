import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import {
  AUTHENTICATED_ROUTES,
  VIEWPORTS,
  assertNoHorizontalOverflow,
  gotoHydrated,
  gotoAuthenticated,
} from "../helpers/ui";
import {
  assertAppSurface,
  assertBrandPrimaryToken,
  assertHeaderTrialCta,
  assertNoAuroraRingInApp,
  assertAuthPortalCanvas,
  assertAuthenticatedShell,
} from "../helpers/design";

test.describe("Wireline design — landing hero & trust", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("landing hero demo block is structured", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hero-section")).toBeVisible();
    await expect(page.getByTestId("hero-showcase-link")).toBeVisible();
    await assertHeaderTrialCta(page);
  });

  test("auth pages use rich cream canvas", async ({ page }) => {
    for (const path of ["/signin", "/signup", "/reset-password"] as const) {
      await gotoHydrated(page, path);
      await assertAuthPortalCanvas(page);
    }
  });

  test("landing trust badges visible and section robots removed", async ({ page }) => {
    await gotoHydrated(page, "/");
    const badges = page.getByTestId("hero-trust-badges");
    await expect(badges).toBeVisible();
    const fontSize = await badges
      .locator("span.font-medium")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(12);
    await expect(page.getByTestId("proof-robot-decorations-top")).toHaveCount(0);
    await expect(page.getByTestId("integrations-robot-decorations")).toHaveCount(0);
    await expect(page.getByTestId("faq-robot-decorations")).toHaveCount(0);
  });

  test("landing hero robots render on laptop and desktop viewports", async ({ page }) => {
    for (const viewport of [
      { width: 1366, height: 768, name: "laptop" },
      { width: 1920, height: 1080, name: "desktop" },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHydrated(page, "/");
      const heroRobots = page.getByTestId("hero-robot-decorations");
      await expect(heroRobots).toBeVisible();
      await expect(heroRobots.locator(".wl-sticker-slot")).toHaveCount(4);
    }
  });
});

test.describe("Wireline design — public responsive integrity", () => {
  for (const viewport of VIEWPORTS) {
    test(`landing at ${viewport.name} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoHydrated(page, "/");
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Wireline design — authenticated app surfaces", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route.path} renders app surface without aurora-ring`, async ({ page }) => {
      await gotoAuthenticated(page, route.path);
      await assertAuthenticatedShell(page);
      await assertNoAuroraRingInApp(page);
      await assertBrandPrimaryToken(page);
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Wireline design — authenticated mobile shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, baseURL!);
  });

  for (const path of ["/chat", "/phone", "/agents", "/integrations"] as const) {
    test(`${path} mobile layout stays in brand shell`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
        timeout: 25_000,
      });
      await assertAppSurface(page);
      await assertNoHorizontalOverflow(page);
    });
  }
});

// === Cycle 2: Visual Regression for Director Artifacts ===
test.describe("Wireline design — Director artifacts panel visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director artifacts panel renders consistently (visual regression)", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    // Wait for the Director workspace and artifacts panel to be ready
    await expect(page.getByRole("heading", { name: /Director|artifacts/i }).first()).toBeVisible({ timeout: 15000 });

    const artifactsPanel = page.locator(".wl-director-artifacts, [data-testid*='artifact'], .director-artifacts-panel").first();

    // Take visual regression snapshot of the artifacts gallery
    await expect(artifactsPanel).toHaveScreenshot({
      name: "director-artifacts-panel.png",
      threshold: 0.2, // Allow minor anti-aliasing differences
    });
  });
});
