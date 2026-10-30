import { expect, test } from "@playwright/test";

const COLORS = {
  light: "rgb(247, 247, 243)",
  dark: "rgb(10, 10, 14)",
} as const;

for (const width of [390, 1440] as const) {
  for (const preference of ["light", "dark"] as const) {
    test(`public appearance persists at ${width}px in ${preference}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem("wireline-theme", theme);
      }, preference);
      await page.goto("/");
      await expect
        .poll(() =>
          page.evaluate(() => ({
            light: document.documentElement.classList.contains("light"),
            body: getComputedStyle(document.body).backgroundColor,
            scheme: getComputedStyle(document.documentElement).colorScheme,
          })),
        )
        .toEqual({
          light: preference === "light",
          body: COLORS[preference],
          scheme: preference,
        });

      if (width < 768) {
        await page.getByRole("button", { name: "Toggle navigation menu" }).click();
      }
      await page
        .getByRole("button", {
          name: `Switch to ${preference === "light" ? "dark" : "light"} appearance`,
        })
        .click();
      const opposite = preference === "light" ? "dark" : "light";
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("wireline-theme")))
        .toBe(opposite);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
        .toBe(opposite);
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
        .toBe(opposite === "light");
    });
  }
}

test("sign-in exposes an appearance switch without obstructing authentication", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("wireline-theme", "light"));
  await page.goto("/signin");
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark appearance" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe("dark");
});
