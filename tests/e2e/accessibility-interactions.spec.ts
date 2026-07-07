import { expect, test, type Page } from "@playwright/test";

const publicRoutes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/about",
  "/security",
  "/support",
  "/contact",
];
const pageEntrySelector = 'main, [role="main"], #main-content';

async function gotoPublicRouteWithMain(page: Page, route: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(route, { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    try {
      await expect(
        page.locator(pageEntrySelector).first(),
        `${route} should expose a main landmark or skip-link target`,
      ).toBeVisible({ timeout: 30_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

test.describe("keyboard accessibility interactions", () => {
  test.setTimeout(90_000);

  for (const route of publicRoutes) {
    test(`${route} exposes a semantic page entry and visible keyboard focus`, async ({ page }) => {
      await gotoPublicRouteWithMain(page, route);

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const active = document.activeElement;
              if (!(active instanceof HTMLElement)) return false;
              const box = active.getBoundingClientRect();
              const style = window.getComputedStyle(active);
              return (
                box.width > 0 &&
                box.height > 0 &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                style.opacity !== "0"
              );
            }),
          { message: `${route} first Tab focus should be visible`, timeout: 5_000 },
        )
        .toBe(true);
    });
  }

  test("sign-in form exposes labeled editable controls", async ({ page }) => {
    await page.goto("/signin", { waitUntil: "commit" });
    await expect(page.locator("body")).toBeVisible();

    const editables = page.getByRole("textbox");
    await expect(editables.first()).toBeVisible();

    const editableCount = await editables.count();
    expect(editableCount).toBeGreaterThan(0);

    for (let index = 0; index < Math.min(editableCount, 5); index += 1) {
      const input = editables.nth(index);
      const name = await input.evaluate(
        (element) =>
          element.getAttribute("aria-label") ||
          element.getAttribute("aria-labelledby") ||
          element.getAttribute("placeholder") ||
          "",
      );
      expect(
        name.trim().length,
        "Editable controls should have a programmatic or visible label fallback",
      ).toBeGreaterThan(0);
    }
  });
});
