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

test("homepage hero has accessible audience tabs and no serious axe violations", async ({
  page,
}) => {
  await gotoHomepageWithMain(page);
  await expect(page.getByRole("heading", { name: /wire your agent/i })).toBeVisible();
  await expect(
    page.getByText(/personal assistants to call centers and sales teams/i),
  ).toBeVisible();
  const audienceList = page.getByRole("list", { name: "Wireline audiences" });
  await expect(audienceList.getByText(/Personal calls/).first()).toBeVisible();
  await expect(audienceList.getByText(/Support/).first()).toBeVisible();
  await expect(audienceList.getByText(/Call centers/).first()).toBeVisible();

  const tablist = page.getByRole("tablist", { name: "Agent call direction" });
  await expect(tablist).toBeVisible();

  const outboundTab = page.getByRole("tab", { name: "Outbound" });
  const inboundTab = page.getByRole("tab", { name: "Inbound" });
  const hybridTab = page.getByRole("tab", { name: "Hybrid" });

  await expect(outboundTab).toHaveAttribute("aria-selected", "true");
  await expect(outboundTab).toHaveAttribute("aria-controls", "wire-agent-outbound-panel");
  await expect(inboundTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel", { name: "Outbound" })).toBeVisible();

  await outboundTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(inboundTab).toBeFocused();
  await expect(inboundTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Inbound" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(hybridTab).toBeFocused();
  await expect(hybridTab).toHaveAttribute("aria-selected", "true");

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});
