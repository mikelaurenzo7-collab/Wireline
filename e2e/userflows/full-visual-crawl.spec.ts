import { test, expect } from "@playwright/test";
import { hasE2eCredentials, loginAsTestUser } from "../fixtures/auth";
import {
  attachFullPagePng,
  exploreFloatingRail,
  exploreRoleTabs,
  exploreSectionNavLinks,
} from "../fixtures/visual-qa";

/**
 * Comprehensive visual / navigation QA pack.
 *
 * - Visits every authenticated route from `AppRoutes` (+ 404 probe).
 * - Walks HubTabs link groups (Channels, Training, System).
 * - Clicks safe `role=tab` strips (Admin settings, Agents).
 * - Clicks every primary FloatingRail destination.
 *
 * Screenshots are **attached to the HTML report** (not committed baselines).
 *
 * Run (long): `npx playwright test --grep @visual-full`
 */
const AUTH_ROUTES = [
  "/",
  "/command",
  "/dashboard",
  "/live",
  "/triage",
  "/insights",
  "/contact/15551234567",
  "/logs",
  "/inbox",
  "/outbound",
  "/appointments",
  "/train",
  "/knowledge",
  "/agents",
  "/integrations",
  "/admin",
  "/dnc",
  "/audit",
] as const;

function routeSlug(path: string): string {
  if (path === "/") return "root";
  return path.replace(/^\//, "").replace(/\//g, "_");
}

test.describe("@visual-full Public legal pages", () => {
  test("/privacy renders", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("domcontentloaded");
    await attachFullPagePng(page, "public-privacy");
    await expect(page.getByText(/privacy|policy/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("/terms renders", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("domcontentloaded");
    await attachFullPagePng(page, "public-terms");
    await expect(page.getByText(/terms|service/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe.serial("@visual-full Authenticated visual crawl", () => {
  test.describe.configure({ timeout: 600_000 });

  test("routes, hubs, tabs, and rail (screenshots in report)", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_USER_EMAIL + E2E_USER_PASSWORD (or E2E_TEST_*)");

    await page.addInitScript(() => {
      try {
        localStorage.setItem("wireline.rail.pinned", "1");
      } catch {
        /* ignore */
      }
    });

    await loginAsTestUser(page);

    for (const path of AUTH_ROUTES) {
      await test.step(`visit ${path}`, async () => {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("body")).toBeVisible();
        await attachFullPagePng(page, `route-${routeSlug(path)}`);
      });
    }

    await test.step("not-found shell", async () => {
      await page.goto("/__wireline_e2e_unknown_route__");
      await page.waitForLoadState("domcontentloaded");
      await attachFullPagePng(page, "route-not-found");
      await expect(page.getByText(/not found|404|missing|lost/i).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step("Channels hub (Logs → siblings)", async () => {
      await page.goto("/logs");
      await exploreSectionNavLinks(page, "Channels sub-navigation", "channels");
    });

    await test.step("Training hub (Lessons ↔ Knowledge)", async () => {
      await page.goto("/train");
      await exploreSectionNavLinks(page, "Training sub-navigation", "training");
    });

    await test.step("System hub (Settings ↔ DNC ↔ Audit)", async () => {
      await page.goto("/admin");
      await exploreSectionNavLinks(page, "System sub-navigation", "system");
    });

    await test.step("Admin settings tab strip", async () => {
      await page.goto("/admin");
      await exploreRoleTabs(page, "admin", 30);
    });

    await test.step("Agents Templates vs My Fleet tabs", async () => {
      await page.goto("/agents");
      await exploreRoleTabs(page, "agents", 12);
    });

    await test.step("Floating rail — every Go to link", async () => {
      await page.goto("/");
      await exploreFloatingRail(page);
    });
  });
});
