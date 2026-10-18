import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

test("homepage mobile product and account links have clear branding and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.getByRole("link", { name: "BotBound home" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voice Bots. Business Numbers.", exact: true }),
  ).toBeVisible();
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByRole("link", { name: "Start Free", exact: true })).toBeVisible();
  await account.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign In", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage Voice Bot promise and account links stay inside the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: "Voice Bots. Business Numbers.",
    exact: true,
  });
  const hero = page.locator(".landing-prestige__hero");
  await expect(headline).toBeVisible();
  await expect(hero).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Get started with BotBound" })).toBeVisible();

  const bounds = await page.evaluate(() => {
    const headline = document
      .querySelector(".landing-prestige__hero-copy h1")
      ?.getBoundingClientRect();
    const hero = document.querySelector(".landing-prestige__hero")?.getBoundingClientRect();
    return {
      headlineLeft: headline?.left ?? -1,
      headlineRight: headline?.right ?? Number.POSITIVE_INFINITY,
      heroLeft: hero?.left ?? -1,
      heroRight: hero?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(bounds.headlineLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.headlineRight).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.heroLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.heroRight).toBeLessThanOrEqual(bounds.viewportWidth);
});

test("homepage primary actions expose focus and mobile account navigation cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const startFree = page
    .getByRole("navigation", { name: "Get started with BotBound" })
    .getByRole("link", { name: "Start Free" });
  await startFree.focus();
  await expect(startFree).toBeFocused();
  const focusStyle = await startFree.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHomepageWithMain(page);
  const account = page.getByRole("navigation", { name: "Account" });
  await account.getByRole("button", { name: "Open navigation" }).click();
  const signIn = page.getByRole("menuitem", { name: "Sign In", exact: true });
  await expect(signIn).toBeInViewport();
  await expect(signIn).toHaveAttribute("href", "/signin");
});
