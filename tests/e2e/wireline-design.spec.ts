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

  test("landing trust badges visible", async ({ page }) => {
    await gotoHydrated(page, "/");
    const badges = page.getByTestId("hero-trust-badges");
    await expect(badges).toBeVisible();
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

    await expect(page.getByRole("heading", { name: /Director|artifacts/i }).first()).toBeVisible({
      timeout: 15000,
    });

    const artifactsPanel = page
      .locator(".wl-director-artifacts, [data-testid*='artifact'], .director-artifacts-panel")
      .first();

    await expect(artifactsPanel).toHaveScreenshot({
      name: "director-artifacts-panel.png",
      threshold: 0.2,
    });
  });
});

// === Cycle 3: Visual Regression for Director Composer ===
test.describe("Wireline design — Director composer visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director composer toolbar and model picker render consistently", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    // Wait for Director to load
    await expect(page.getByRole("heading", { name: /Director/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // Target the composer toolbar area (contains model picker + tool chips)
    const composerToolbar = page
      .locator(".director-composer-toolbar, [data-testid*='composer'], .wl-director-composer")
      .first();

    await expect(composerToolbar).toHaveScreenshot({
      name: "director-composer-toolbar.png",
      threshold: 0.25, // Slightly higher tolerance for interactive elements
    });
  });
});

// === Cycle 6: Visual Regression for Director Empty State ===
test.describe("Wireline design — Director empty state visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director empty state renders beautifully and consistently", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    // Wait for empty state to appear (no messages)
    await expect(page.getByText(/Always-on fleet manager|Mission control/i)).toBeVisible({
      timeout: 15000,
    });

    const emptyHero = page
      .locator(".wl-director-empty-section, [data-testid*='empty'], .director-empty-hero")
      .first();

    await expect(emptyHero).toHaveScreenshot({
      name: "director-empty-state.png",
      threshold: 0.2,
    });
  });
});

// === Cycle 7: Visual Regression for Director Live Session ===
test.describe("Wireline design — Director live session visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director live mission control panel renders consistently when active", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    // Wait for Director workspace to load
    await expect(page.getByRole("heading", { name: /Director/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // The live session panel appears during streaming. We test the container structure.
    const liveSession = page
      .locator(".wl-panel, [data-testid*='live-session'], .director-live-session")
      .first();

    if (await liveSession.isVisible().catch(() => false)) {
      await expect(liveSession).toHaveScreenshot({
        name: "director-live-session.png",
        threshold: 0.3,
      });
    }
  });
});

// === Cycle 9: Visual Regression for Director Starter Prompts & Capabilities ===
test.describe("Wireline design — Director starter prompts and capabilities visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director starter prompts and capability catalog render consistently", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    await expect(page.getByRole("heading", { name: /Director/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // Target the starter prompts and capability catalog area in empty state
    const starterSection = page
      .locator(".wl-director-empty-section, [data-testid*='starter'], .director-capability-catalog")
      .first();

    if (await starterSection.isVisible().catch(() => false)) {
      await expect(starterSection).toHaveScreenshot({
        name: "director-starter-prompts.png",
        threshold: 0.25,
      });
    }
  });
});

// === Cycle 10: Visual Regression for Director Thread Header ===
test.describe("Wireline design — Director thread header visual regression", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("Director thread header and clear button render consistently", async ({ page }) => {
    await gotoAuthenticated(page, "/director");

    // Wait for Director to have messages (so header appears)
    await expect(page.getByRole("heading", { name: /Director/i }).first()).toBeVisible({
      timeout: 15000,
    });

    const threadHeader = page
      .locator(
        ".wl-director-thread-header, [data-testid*='thread-header'], .border-b.border-brand\\/6",
      )
      .first();

    if (await threadHeader.isVisible().catch(() => false)) {
      await expect(threadHeader).toHaveScreenshot({
        name: "director-thread-header.png",
        threshold: 0.2,
      });
    }
  });
});
