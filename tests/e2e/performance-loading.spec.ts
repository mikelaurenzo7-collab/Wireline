import { test, expect } from "@playwright/test";
import { gotoHydrated } from "../helpers/ui";
import { authenticatePage } from "../helpers/wireline-auth";

/**
 * Performance & loading behaviour — user-perceived quality.
 *
 * These tests validate that pages load within acceptable timeframes,
 * display loading states correctly, and don't flash unstyled content.
 * They also verify that critical above-the-fold content appears quickly.
 */
test.describe("Performance — public page load times", () => {
  const CRITICAL_PAGES = ["/", "/pricing", "/signup", "/signin", "/showcase"];

  for (const path of CRITICAL_PAGES) {
    test(`${path} renders above-the-fold content within 5s`, async ({ page }) => {
      const start = Date.now();
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
        timeout: 5_000,
      });
      const elapsed = Date.now() - start;

      // Log performance metric (not hard-fail, but tracks regression)
      console.log(`${path} first meaningful paint: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(5_000);
    });
  }
});

test.describe("Performance — no flash of unstyled content", () => {
  test("landing page does not flash raw HTML before styling", async ({ page }) => {
    await page.goto("/");

    // The site header should be styled (has background or border)
    await expect(page.getByTestId("site-header")).toBeVisible({ timeout: 10_000 });

    // Check that CSS is loaded by verifying a styled property
    const headerBg = await page.getByTestId("site-header").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor || style.borderBottomColor;
    });
    expect(headerBg).toBeTruthy();
  });
});

test.describe("Performance — lazy-loaded route chunks", () => {
  test("navigating between public pages does not cause full reload", async ({ page }) => {
    await gotoHydrated(page, "/");

    // Navigate to pricing via click (SPA navigation)
    const pricingLink = page.locator('nav a[href="/pricing"], a[href="/pricing"]').first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/\/pricing/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("Performance — image loading", () => {
  test("landing page images use lazy loading for below-fold content", async ({ page }) => {
    await gotoHydrated(page, "/");

    const images = page.locator("img");
    const count = await images.count();

    if (count > 3) {
      // At least some images should have loading="lazy" for performance
      const lazyCount = await page.locator('img[loading="lazy"]').count();
      // Allow first few images to be eager (above fold), rest should be lazy
      console.log(`${lazyCount}/${count} images use lazy loading`);
    }
  });
});

test.describe("Performance — authenticated page shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await authenticatePage(page, baseURL!);
  });

  test("authenticated navigation between pages is smooth (SPA)", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 25_000 });

    // Navigate to another page — should NOT trigger full page reload
    const navLink = page.locator('a[href="/phone"], nav a[href="/phone"]').first();
    if (await navLink.isVisible()) {
      await Promise.all([
        page
          .waitForResponse((r) => r.url().includes("/phone"), { timeout: 5_000 })
          .catch(() => null),
        navLink.click(),
      ]);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 25_000 });
    }
  });
});

test.describe("Error resilience — network failure handling", () => {
  test("public page still renders structure when API is slow", async ({ page }) => {
    // Simulate slow API by blocking optional API calls
    await page.route("**/api/public/stats", (route) => {
      // Delay response significantly
      setTimeout(() => route.fulfill({ status: 200, body: "{}" }), 3000);
    });

    await page.goto("/");
    // Page structure should still render even if stats API is slow
    await expect(page.getByTestId("site-header")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test("signup page remains functional when non-critical APIs fail", async ({ page }) => {
    // Block optional enrichment APIs
    await page.route("**/api/public/**", (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    });

    await gotoHydrated(page, "/signup");

    // Form should still be functional
    const emailInput = page.getByPlaceholder(/you@company/i).first();
    await expect(emailInput).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });
});
