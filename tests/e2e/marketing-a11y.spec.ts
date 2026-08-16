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

test("homepage stages a live agent on a phone with no serious axe violations", async ({
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

  const channelList = page.getByRole("list", { name: "Agent channels" });
  await expect(channelList).toBeVisible();
  for (const label of ["Voice", "Text", "Email", "Live Video"]) {
    await expect(channelList.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }

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

  await expect(page.getByRole("button", { name: /Hear It Live/i }).or(page.getByRole("link", { name: /Hear It Live/i }))).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage hero stays inside the desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: MARKETING_VOICE.headline,
    exact: true,
  });
  await expect(headline).toBeVisible();

  const bounds = await headline.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
});
