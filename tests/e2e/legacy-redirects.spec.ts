import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import { LEGACY_REDIRECTS } from "../helpers/ui";

/**
 * Legacy route redirects — backwards compatibility.
 *
 * As pages get consolidated and renamed, old bookmark URLs and external links
 * must continue working via 301/302 redirects. These tests verify every known
 * legacy path forwards to its new canonical destination.
 */
test.describe("Legacy redirects — authenticated routes", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await authenticatePage(page, baseURL!);
  });

  for (const { from, to } of LEGACY_REDIRECTS) {
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from, { waitUntil: "domcontentloaded" });

      // The page must land on the new canonical URL (allow query params)
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}(\\?|$)`), {
        timeout: 15_000,
      });
    });
  }
});

test.describe("Legacy redirects — outbound query-based redirect", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await authenticatePage(page, baseURL!);
  });

  test("/outbound redirects to /phone?tab=outbound", async ({ page }) => {
    await page.goto("/outbound", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/phone\?tab=outbound/, { timeout: 15_000 });
  });
});

test.describe("Legacy redirects — unauthenticated behaviour", () => {
  test("legacy route /dashboard redirects but still requires auth", async ({ page }) => {
    await page.goto("/dashboard");

    // Unauthenticated: should ultimately land on signin
    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("legacy route /logs redirects but still requires auth", async ({ page }) => {
    await page.goto("/logs");

    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
