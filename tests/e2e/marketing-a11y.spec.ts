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
  await gotoHomepageWithMain(page);
  await expect(page.getByRole("heading", { name: /wire\. work\. win\./i })).toBeVisible();
  await expect(page.getByText(/voice ai employee for real conversations/i)).toBeVisible();

  const proofList = page.getByRole("list", { name: "Wireline proof points" });
  for (const label of ["Sales", "Marketing", "Support", "Admin"]) {
    await expect(proofList.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }

  const tablist = page.getByRole("tablist", { name: "Agent call direction" });
  await expect(tablist).toBeVisible();

  const salesTab = page.getByRole("tab", { name: "Sales" });
  const serviceTab = page.getByRole("tab", { name: "Service" });
  const allPurposeTab = page.getByRole("tab", { name: "All-purpose" });

  await expect(salesTab).toHaveAttribute("aria-selected", "true");
  await expect(salesTab).toHaveAttribute("aria-controls", "wire-agent-outbound-panel");
  await expect(serviceTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel", { name: "Sales agent details" })).toBeVisible();

  await salesTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(serviceTab).toBeFocused();
  await expect(serviceTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Service agent details" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(allPurposeTab).toBeFocused();
  await expect(allPurposeTab).toHaveAttribute("aria-selected", "true");

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});
