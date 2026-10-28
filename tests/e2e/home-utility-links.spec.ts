import { expect, test } from "@playwright/test";

test("home keeps compact access to information and privacy choices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("wireline_cookie_consent", "acknowledged");
    localStorage.setItem("wireline_marketing_measurement_consent", "denied");
  });
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Information and privacy" });
  for (const [name, href] of [
    ["Product", "/features"],
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["Contact", "/contact"],
  ]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }

  await nav.getByRole("button", { name: "Privacy Choices" }).click();
  const choices = page.getByRole("region", { name: "Privacy Choices" });
  await expect(choices).toBeVisible();
  await choices.getByRole("button", { name: "Essential Only" }).click();
  await expect(choices).not.toBeVisible();
  await expect(nav.getByRole("button", { name: "Privacy Choices" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await nav.getByRole("link", { name: "Product", exact: true }).click();
  await expect(page).toHaveURL(/\/features$/);
  await expect(page.getByRole("heading", { name: "BOTS FOR EVERY JOB." })).toBeVisible();
});
