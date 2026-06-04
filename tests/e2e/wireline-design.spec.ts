import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import {
  PUBLIC_ROUTES,
  EXTENDED_PUBLIC_ROUTES,
  AUTHENTICATED_ROUTES,
  VIEWPORTS,
  assertNoHorizontalOverflow,
  assertSingleH1,
  gotoHydrated,
} from "../helpers/ui";
import {
  assertAppSurface,
  assertBrandPrimaryToken,
  assertHeaderTrialCta,
  assertMarketingSurface,
  assertNoAuroraRingInApp,
  assertPaperBackground,
} from "../helpers/design";

const PUBLIC_DESIGN_ROUTES = [
  ...PUBLIC_ROUTES.map((r) => r.path),
  ...EXTENDED_PUBLIC_ROUTES.map((r) => r.path),
];

const AUTH_DESIGN_ROUTES = AUTHENTICATED_ROUTES.map((r) => r.path);

test.describe("Wireline design — public marketing surfaces", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of PUBLIC_DESIGN_ROUTES) {
    test(`${path} uses marketing surface + brand tokens`, async ({ page }) => {
      await gotoHydrated(page, path);
      await assertMarketingSurface(page);
      await assertBrandPrimaryToken(page);
      await assertPaperBackground(page);
      await assertSingleH1(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test("landing hero demo block is structured", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hero-section")).toBeVisible();
    await expect(page.getByTestId("hero-showcase-link")).toBeVisible();
    await assertHeaderTrialCta(page);
  });

  test("landing gutter robots render on xl viewports", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/");
    await expect(page.getByTestId("hero-robot-decorations")).toBeVisible();
    await expect(page.getByTestId("proof-robot-decorations")).toBeVisible();
    await expect(page.getByTestId("integrations-robot-decorations")).toBeVisible();
    await page.getByTestId("faq-section").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("faq-robot-decorations")).toBeVisible();
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

  for (const path of AUTH_DESIGN_ROUTES) {
    test(`${path} renders app surface without aurora-ring`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
        timeout: 25_000,
      });
      await assertAppSurface(page);
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
