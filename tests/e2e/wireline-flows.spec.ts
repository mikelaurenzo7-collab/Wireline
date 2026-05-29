import { test, expect, type Page } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";

async function assertNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  expect(overflows, "page must not scroll horizontally").toBe(false);
}

async function openMobileNav(page: Page) {
  await page.getByRole("button", { name: /open menu/i }).click();
  await expect(page.getByRole("dialog", { name: "Site navigation" })).toBeVisible();
}

function signInLinks(page: Page) {
  return page.getByRole("link", { name: /^sign in$/i });
}

test.describe("Wireline public surfaces", () => {
  test("landing exposes trial CTA and sign-in (mobile menu when header link hidden)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page).toHaveTitle(/Wireline/i);
    await expect(page.getByRole("link", { name: /start free trial/i }).first()).toBeVisible();

    const headerSignIn = page.locator("header").getByRole("link", { name: /^sign in$/i });
    if (await headerSignIn.isVisible()) {
      await expect(headerSignIn).toBeVisible();
    } else {
      await openMobileNav(page);
      await expect(
        page
          .getByRole("dialog", { name: "Site navigation" })
          .getByRole("link", { name: /^sign in$/i }),
      ).toBeVisible();
    }

    await expect(signInLinks(page).first()).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test("pricing and showcase load without horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const path of ["/pricing", "/showcase"]) {
      await page.goto(path);
      await expect(page).toHaveTitle(/Wireline/i);
      await assertNoHorizontalOverflow(page);
    }
  });
});

test.describe("Wireline authenticated shell (mobile)", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, baseURL!);
  });

  const routes: { path: string; heading: RegExp }[] = [
    { path: "/", heading: /live ops/i },
    { path: "/outbound", heading: /^outbound$/i },
    { path: "/insights", heading: /^insights$/i },
    { path: "/triage", heading: /^triage$/i },
    { path: "/cockpit", heading: /^cockpit$/i },
  ];

  for (const { path, heading } of routes) {
    test(`${path} renders primary chrome without horizontal overflow`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}(\\?|$)`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({
        timeout: 25_000,
      });
      await assertNoHorizontalOverflow(page);
    });
  }

  test("/chat renders the Director rail without horizontal overflow", async ({ page }) => {
    // Chat is the primary surface. The Director is always present (even before
    // any agents exist), so this is a fixture-independent smoke check that the
    // chat-centric home loads and fits a phone viewport.
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/chat(\?|$)/);
    await expect(page.getByRole("button", { name: /director/i })).toBeVisible({
      timeout: 25_000,
    });
    await assertNoHorizontalOverflow(page);
  });

  test("/train redirects into the chat surface", async ({ page }) => {
    // The standalone training page was retired; the route now redirects so old
    // bookmarks still land somewhere useful.
    await page.goto("/train", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/chat(\?|$)/);
  });

  test("insights exposes mobile page actions sheet", async ({ page }) => {
    await page.goto("/insights", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/insights/);
    await expect(page.getByRole("heading", { level: 1, name: /^insights$/i })).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: /page actions/i }).click();
    await expect(page.getByRole("dialog", { name: /page actions/i })).toBeVisible();
    await page.getByRole("button", { name: /close actions/i }).click();
    await expect(page.getByRole("dialog", { name: /page actions/i })).toBeHidden();
  });

  test("live ops exposes mobile page actions sheet", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /live ops/i })).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: /page actions/i }).click();
    await expect(page.getByRole("dialog", { name: /page actions/i })).toBeVisible();
  });
});

test.describe("Wireline authenticated shell (desktop)", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("command center, outbound, and insights show in-header actions (no overflow sheet trigger)", async ({
    page,
  }) => {
    for (const path of ["/", "/outbound", "/insights"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /page actions/i })).toBeHidden();
      await assertNoHorizontalOverflow(page);
    }
  });
});
