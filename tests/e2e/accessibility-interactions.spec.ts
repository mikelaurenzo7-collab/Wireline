import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/features", "/pricing", "/showcase", "/about", "/security", "/support", "/contact"];

test.describe("keyboard accessibility interactions", () => {
  for (const route of publicRoutes) {
    test(`${route} exposes a semantic page entry and visible keyboard focus`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();

      const pageEntry = page.locator('main, [role="main"], #main-content').first();
      await expect(pageEntry, `${route} should expose a main landmark or skip-link target`).toBeVisible();

      await page.keyboard.press("Tab");
      const focusState = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return { tag: "", text: "", visible: false };
        const box = active.getBoundingClientRect();
        const style = window.getComputedStyle(active);
        return {
          tag: active.tagName.toLowerCase(),
          text: active.textContent?.trim().slice(0, 80) ?? "",
          visible:
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0",
        };
      });

      expect(focusState.visible, `${route} first Tab focus should be visible: ${JSON.stringify(focusState)}`).toBe(true);
    });
  }

  test("sign-in form exposes labeled editable controls", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.locator("body")).toBeVisible();

    const editables = page.getByRole("textbox");
    await expect(editables.first()).toBeVisible();

    const editableCount = await editables.count();
    expect(editableCount).toBeGreaterThan(0);

    for (let index = 0; index < Math.min(editableCount, 5); index += 1) {
      const input = editables.nth(index);
      const name = await input.evaluate((element) => element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("placeholder") || "");
      expect(name.trim().length, "Editable controls should have a programmatic or visible label fallback").toBeGreaterThan(0);
    }
  });
});
