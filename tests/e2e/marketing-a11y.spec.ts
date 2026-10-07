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

test("homepage mobile product and access path has clear branding and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.getByRole("link", { name: "BotBound home" })).toBeVisible();
  const actions = page.locator(".landing-prestige__hero .landing-prestige__actions");
  await expect(actions.getByRole("link", { name: "Start Free" })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage promise and access path stay centered inside the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: "Voice Bots With a Computer, Phone Number, and Branded Email.",
    exact: true,
  });
  await expect(headline).toBeVisible();
  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Choose Bot direction" })).toBeVisible();

  const bounds = await page.evaluate(() => {
    const headline = document.querySelector(".landing-prestige__hero h1")?.getBoundingClientRect();
    const actions = document
      .querySelector(".landing-prestige__hero .landing-prestige__actions")
      ?.getBoundingClientRect();
    return {
      headlineLeft: headline?.left ?? -1,
      headlineRight: headline?.right ?? Number.POSITIVE_INFINITY,
      actionsLeft: actions?.left ?? -1,
      actionsRight: actions?.right ?? Number.POSITIVE_INFINITY,
      actionsBottom: actions?.bottom ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(bounds.headlineLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.headlineRight).toBeLessThanOrEqual(bounds.viewportWidth);
  const actionsCenter = (bounds.actionsLeft + bounds.actionsRight) / 2;
  expect(Math.abs(actionsCenter - bounds.viewportWidth / 2)).toBeLessThan(24);
  expect(bounds.actionsBottom).toBeLessThanOrEqual(bounds.viewportHeight);
});

test("homepage primary paths expose focus and change state cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const outbound = page
    .getByRole("navigation", { name: "Choose Bot direction" })
    .getByRole("link", { name: /OUTBOUND\s+Find\. Call\. Book\./i });
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
  const start = page
    .locator(".landing-prestige__hero .landing-prestige__actions")
    .getByRole("link", { name: "Start Free" });
  await start.click();
  await expect(page).toHaveURL(/\/signup\?[^\s]*plan=free/);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
});
