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

test("homepage hero has accessible work-lane tabs and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);
  await expect(
    page.getByRole("heading", { name: MARKETING_VOICE.headline, exact: true }),
  ).toBeVisible();
  // The hero heading carries the accessible name; the subline is no longer
  // rendered as a hero subhead (the pitch lives in the title, chips, and demo).

  // The hero's separate brand-spine word-mark was deliberately removed in the
  // minimal-copy pass (#1042); the operating loop now appears once in the
  // document outline. It is intentionally sr-only, so assert presence rather
  // than visual rendering.
  await expect(
    page.getByRole("heading", { name: "How Wireline works", exact: true }),
  ).toBeAttached();

  // Channel proof lives in the Live Video spotlight's "Agent channels" list
  // since the hero minimal-copy pass; the old "Wireline capabilities" hero
  // list no longer exists.
  const channelList = page.getByRole("list", { name: "Agent channels" });
  await expect(channelList).toBeVisible();
  for (const label of ["Voice", "Text", "Email", "Live Video"]) {
    await expect(channelList.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }

  const tablist = page.getByRole("tablist", { name: "Agent work lane" });
  await expect(tablist).toBeVisible();

  // Tab names come from AGENT_DIRECTION_MODES for the same reason as the proof
  // labels: a copy rename must fail the contract tests, not desync this spec.
  const salesTab = page.getByRole("tab", { name: AGENT_DIRECTION_MODES.outbound.label });
  const serviceTab = page.getByRole("tab", { name: AGENT_DIRECTION_MODES.inbound.label });
  const allPurposeTab = page.getByRole("tab", { name: AGENT_DIRECTION_MODES.hybrid.label });

  await expect(salesTab).toHaveAttribute("aria-selected", "true");
  await expect(salesTab).toHaveAttribute("aria-controls", "wire-agent-outbound-panel");
  await expect(serviceTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel", { name: "Sales" })).toBeVisible();

  await salesTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(serviceTab).toBeFocused();
  await expect(serviceTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Service" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(allPurposeTab).toBeFocused();
  await expect(allPurposeTab).toHaveAttribute("aria-selected", "true");

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
