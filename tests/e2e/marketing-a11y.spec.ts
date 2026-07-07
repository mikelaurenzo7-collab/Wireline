import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("homepage hero has accessible audience tabs and no serious axe violations", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /wire your agent/i })).toBeVisible();
  await expect(page.getByText(/personal assistants/i).first()).toBeVisible();
  await expect(page.getByText(/call centers and sales teams/i).first()).toBeVisible();
  await expect(page.getByText("Answers the line").first()).toBeVisible();
  await expect(page.getByText("Books and qualifies").first()).toBeVisible();
  await expect(page.getByText("Texts every outcome").first()).toBeVisible();

  const tablist = page.getByRole("tablist", { name: "Audience mode" });
  await expect(tablist).toBeVisible();

  const personalTab = page.getByRole("tab", { name: "Personal" });
  const businessTab = page.getByRole("tab", { name: "Business" });

  await expect(personalTab).toHaveAttribute("aria-selected", "false");
  await expect(personalTab).toHaveAttribute("aria-controls", "wireline-personal-audience-panel");
  await expect(businessTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Business" })).toBeVisible();

  await businessTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(personalTab).toBeFocused();
  await expect(personalTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Personal" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(businessTab).toBeFocused();
  await expect(businessTab).toHaveAttribute("aria-selected", "true");

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});
