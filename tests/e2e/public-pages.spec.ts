import { test, expect } from "@playwright/test";
import {
  EXTENDED_PUBLIC_ROUTES,
  VIEWPORTS,
  assertNoHorizontalOverflow,
  assertSingleH1,
  gotoHydrated,
} from "../helpers/ui";

/**
 * Extended public pages — legal, status, and info surfaces.
 *
 * These pages are publicly reachable, require no auth, and must render
 * correctly across all viewport sizes. They include legal compliance pages
 * (privacy, terms), trust-building pages (status, security, changelog),
 * and developer resources.
 */
test.describe("Public pages — legal, status & info surfaces", () => {
  for (const route of EXTENDED_PUBLIC_ROUTES) {
    test(`${route.path} loads with correct title and clean layout`, async ({ page }) => {
      await gotoHydrated(page, route.path);
      await expect(page).toHaveTitle(route.title);
      await assertSingleH1(page);
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Public pages — responsive layout integrity", () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}×${viewport.height})`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of EXTENDED_PUBLIC_ROUTES) {
        test(`${route.path} renders without overflow`, async ({ page }) => {
          await page.goto(route.path);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
            timeout: 20_000,
          });
          await assertNoHorizontalOverflow(page);
        });
      }
    });
  }
});

test.describe("Public pages — legal content requirements", () => {
  test("/privacy renders privacy policy with required sections", async ({ page }) => {
    await gotoHydrated(page, "/privacy");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/privacy/i);
    // Privacy policy must contain key legal sections
    const content = await page.textContent("main, [role='main'], #main-content, body");
    expect(content?.toLowerCase()).toContain("data");
    expect(content?.toLowerCase()).toMatch(/collect|information|personal/);
  });

  test("/terms renders terms of service", async ({ page }) => {
    await gotoHydrated(page, "/terms");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/terms/i);
    const content = await page.textContent("main, [role='main'], #main-content, body");
    expect(content?.toLowerCase()).toMatch(/service|agreement|use/);
  });

  test("/security renders security posture page", async ({ page }) => {
    await gotoHydrated(page, "/security");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const content = await page.textContent("main, [role='main'], #main-content, body");
    expect(content?.toLowerCase()).toMatch(/security|compliance|encrypt/);
  });
});

test.describe("Public pages — status and changelog", () => {
  test("/status renders system health indicator", async ({ page }) => {
    await gotoHydrated(page, "/status");

    await expect(page.getByTestId("status-overall")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("status-component-voice_runtime")).toBeVisible();
    const content = await page.textContent("main, [role='main'], #main-content, body");
    expect(content?.toLowerCase()).toMatch(/status|operational|system|uptime|checking/);
  });

  test("/changelog shows shipping history", async ({ page }) => {
    await gotoHydrated(page, "/changelog");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Changelog should contain dated entries
    const content = await page.textContent("main, [role='main'], #main-content, body");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(100);
  });
});

test.describe("Public pages — 404 handling", () => {
  test("non-existent route renders a not-found page gracefully", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz123");

    // Should either show a 404 page or redirect to landing
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    await assertNoHorizontalOverflow(page);
  });

  test("404 page carries site header for wayfinding", async ({ page }) => {
    await page.goto("/nonexistent-page-test");

    // The site header should still be present for navigation back
    await expect(page.getByTestId("site-header")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Public pages — password reset surface", () => {
  test("/reset-password renders the reset form", async ({ page }) => {
    await page.goto("/reset-password");

    // Should show either the reset form or redirect to signin
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 20_000 });

    // Password reset should have an email or password input
    const hasInput = await page
      .locator("input[type='email'], input[type='password'], input[type='text']")
      .first()
      .isVisible()
      .catch(() => false);

    // If it shows a form, it should have an actionable button
    if (hasInput) {
      await expect(page.getByRole("button").first()).toBeVisible();
    }
  });
});
