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

test("homepage hero has accessible work-lane tabs and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);
  await expect(page.getByRole("heading", { name: /^your next ai employee$/i })).toBeVisible();
  await expect(
    page.getByText(/one trained employee handles customer conversations/i),
  ).toBeVisible();

  const brandSpine = page.getByLabel("Wire to Work to Win");
  await expect(brandSpine).toBeVisible();
  const brandWords = brandSpine.locator("span");
  await expect(brandWords).toHaveCount(3);
  const brandWordBoxes = await brandWords.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    }),
  );
  expect(
    Math.max(...brandWordBoxes.map(({ top }) => top)) -
      Math.min(...brandWordBoxes.map(({ top }) => top)),
  ).toBeLessThan(1);
  expect(brandWordBoxes[0].left).toBeLessThan(brandWordBoxes[1].left);
  expect(brandWordBoxes[1].right).toBeLessThan(brandWordBoxes[2].right);

  const proofList = page.getByRole("list", { name: "Wireline proof points" });
  for (const label of [
    "Voice agent",
    "Text / SMS agent",
    "Email agent",
    "Paid-plan number",
    "Connected inbox",
    "Shared memory",
  ]) {
    await expect(proofList.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }
  const proofRows = await proofList
    .getByRole("listitem")
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(proofRows).size).toBe(3);

  const tablist = page.getByRole("tablist", { name: "Agent work lane" });
  await expect(tablist).toBeVisible();

  const salesTab = page.getByRole("tab", { name: "Sales" });
  const serviceTab = page.getByRole("tab", { name: "Service" });
  const allPurposeTab = page.getByRole("tab", { name: "All-purpose" });

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
