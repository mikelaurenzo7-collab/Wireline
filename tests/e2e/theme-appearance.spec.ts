import { expect, test } from "@playwright/test";

const COLORS = {
  light: "rgb(255, 255, 255)",
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

for (const width of [320, 375] as const) {
  test(`the ${width}px header and browser preview fit without hiding sign-in`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.addInitScript(() => localStorage.setItem("wireline-theme", "light"));
    await page.goto("/");

    const header = page.locator(".wl-public-header");
    await expect(header).toBeVisible();
    const headerBounds = await header.boundingBox();
    expect(headerBounds?.height).toBeLessThanOrEqual(80);
    await expect(header.getByRole("link", { name: "Get Started" })).toBeVisible();

    const browser = page.locator(".landing-prestige__browser-url");
    await expect(browser).toBeVisible();
    const geometry = await browser.evaluate((node) => {
      const url = node.getBoundingClientRect();
      const bar = node.parentElement!.getBoundingClientRect();
      return { urlRight: url.right, barRight: bar.right };
    });
    expect(geometry.urlRight).toBeLessThanOrEqual(geometry.barRight + 1);

    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  });
}

test("System follows OS changes, then an explicit choice persists across routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("wireline-theme", "system"));
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => ({
        isLight: document.documentElement.classList.contains("light"),
        scheme: getComputedStyle(document.documentElement).colorScheme,
        browserColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
      })),
    )
    .toEqual({ isLight: false, scheme: "dark", browserColor: "#0A0A0E" });

  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe("light");
  await page.goto("/pricing");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
    .toBe(true);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe("dark");

  await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  await page.getByRole("button", { name: "Switch to light appearance" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("wireline-theme")))
    .toBe("light");
  await page.goto("/features");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        isLight: document.documentElement.classList.contains("light"),
        browserColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
      })),
    )
    .toEqual({ isLight: true, browserColor: "#FFFFFF" });
});
