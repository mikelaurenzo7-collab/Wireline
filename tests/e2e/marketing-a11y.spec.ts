import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MARKETING_VOICE } from "../../src/lib/product-copy";

test.setTimeout(150_000);

async function gotoHomepageWithMain(page: Page) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/", { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    try {
      await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

test("homepage mobile product and access path has clear branding and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.getByRole("link", { name: "BotBound home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  const accessMode = page.getByRole("group", { name: "Account access mode" });
  await expect(accessMode.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  await expect(
    accessMode.getByRole("button", { name: "Create Account", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Public information" })).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage promise and access path stay inside the desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: MARKETING_VOICE.headline,
    exact: true,
  });
  const hero = page.locator(".landing-prestige__hero");
  const auth = page.locator(".landing-prestige__auth");
  await expect(headline).toBeVisible();
  await expect(hero).toBeVisible();
  await expect(auth).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Choose Bot direction" })).toBeVisible();

  const bounds = await page.evaluate(() => {
    const headline = document
      .querySelector(".landing-prestige__hero-copy h1")
      ?.getBoundingClientRect();
    const hero = document.querySelector(".landing-prestige__hero")?.getBoundingClientRect();
    const auth = document.querySelector(".landing-prestige__auth")?.getBoundingClientRect();
    return {
      headlineLeft: headline?.left ?? -1,
      headlineRight: headline?.right ?? Number.POSITIVE_INFINITY,
      heroLeft: hero?.left ?? -1,
      heroRight: hero?.right ?? Number.POSITIVE_INFINITY,
      authLeft: auth?.left ?? -1,
      authRight: auth?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(bounds.headlineLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.headlineRight).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.heroLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.heroRight).toBeLessThan(bounds.authRight);
  expect(bounds.authLeft).toBeGreaterThanOrEqual(bounds.heroRight - 1);
  expect(bounds.authRight).toBeLessThanOrEqual(bounds.viewportWidth);
});

test("homepage primary paths expose focus and change state cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const outbound = page
    .getByRole("navigation", { name: "Choose Bot direction" })
    .getByRole("link", { name: /OUTBOUND\s+Find\. Call\. Book\./ });
  await outbound.focus();
  await expect(outbound).toBeFocused();
  const focusStyle = await outbound.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHomepageWithMain(page);
  const accessMode = page.getByRole("group", { name: "Account access mode" });
  const createAccountMode = accessMode.getByRole("button", {
    name: "Create Account",
    exact: true,
  });
  await createAccountMode.click();
  await expect(createAccountMode).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeAttached();
});
