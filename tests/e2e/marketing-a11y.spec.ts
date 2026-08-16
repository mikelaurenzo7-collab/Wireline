import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AGENT_DIRECTION_MODES, MARKETING_VOICE } from "../../src/lib/product-copy";

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

test("homepage live console has visible navigation and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);

  await expect(
    page.getByRole("heading", { name: MARKETING_VOICE.headline, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How Wireline works", exact: true }),
  ).toBeAttached();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.getByText("Booked and logged", { exact: true })).toBeVisible();

  const channelList = page.getByRole("list", { name: "Core agent channels" });
  await expect(channelList).toBeVisible();
  for (const label of ["Voice", "Text", "Email"]) {
    await expect(channelList.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }
  await expect(channelList.getByText("Live Video", { exact: false })).toHaveCount(0);

  const workLane = page.getByRole("navigation", { name: "Agent work lane" });
  await expect(workLane).toBeVisible();
  await expect(
    workLane.getByRole("link", { name: new RegExp(`^${AGENT_DIRECTION_MODES.outbound.label}\\b`) }),
  ).toBeVisible();
  await expect(
    workLane.getByRole("link", { name: new RegExp(`^${AGENT_DIRECTION_MODES.inbound.label}\\b`) }),
  ).toBeVisible();
  await expect(
    workLane.getByRole("link", { name: new RegExp(`^${AGENT_DIRECTION_MODES.hybrid.label}\\b`) }),
  ).toBeVisible();

  await expect(
    page
      .getByRole("button", { name: /Hear It Live/i })
      .or(page.getByRole("link", { name: /Hear It Live/i })),
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage narrative and proof stay inside the desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: MARKETING_VOICE.headline,
    exact: true,
  });
  const consoleElement = page.locator(".landing-console");
  await expect(headline).toBeVisible();
  await expect(consoleElement).toBeVisible();

  const bounds = await page.evaluate(() => {
    const headline = document.querySelector(".landing-stage__title")?.getBoundingClientRect();
    const consoleElement = document.querySelector(".landing-console")?.getBoundingClientRect();
    return {
      headlineLeft: headline?.left ?? -1,
      headlineRight: headline?.right ?? Number.POSITIVE_INFINITY,
      consoleLeft: consoleElement?.left ?? -1,
      consoleRight: consoleElement?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(bounds.headlineLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.headlineRight).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.consoleLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.consoleRight).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.headlineRight).toBeLessThan(bounds.consoleRight);
});
