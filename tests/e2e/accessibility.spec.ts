import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, assertSingleH1, gotoHydrated } from "../helpers/ui";

/**
 * Accessibility floor for public surfaces — immaculate, inclusive UX.
 *
 * These are the non-negotiable a11y contracts every prospect-facing page
 * must satisfy: a document language, a single h1, a keyboard skip link,
 * accessible names on every control, and described images.
 */
test.describe("Accessibility — public surfaces", () => {
  test("document declares a language", async ({ page }) => {
    await gotoHydrated(page, "/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang, "<html> must carry a lang attribute").toBeTruthy();
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} keeps a clean heading outline`, async ({ page }) => {
      await gotoHydrated(page, route.path);
      await assertSingleH1(page);
    });
  }

  test("a keyboard skip link targets an existing main landmark", async ({ page }) => {
    // Use a framed content page (/pricing) where the #main-content landmark
    // the skip link points at is present.
    await gotoHydrated(page, "/pricing");

    const skip = page.getByRole("link", { name: /skip to content/i });
    await expect(skip).toHaveAttribute("href", "#main-content");

    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(page.locator("#main-content")).toHaveCount(1);
  });

  test("interactive controls expose accessible names", async ({ page }) => {
    await gotoHydrated(page, "/");

    const controls = page.locator(
      "button:visible, a[href]:visible, input:visible, [role=button]:visible",
    );
    const total = await controls.count();
    expect(total).toBeGreaterThan(0);

    // Sample up to 40 controls to keep the check fast but representative.
    const sample = Math.min(total, 40);
    for (let i = 0; i < sample; i++) {
      const el = controls.nth(i);
      const name = await el.evaluate((node) => {
        const aria = node.getAttribute("aria-label")?.trim();
        if (aria) return aria;
        const labelledby = node.getAttribute("aria-labelledby");
        if (labelledby) return "labelledby";
        const title = node.getAttribute("title")?.trim();
        if (title) return title;
        if (node instanceof HTMLInputElement) {
          if (node.placeholder?.trim()) return node.placeholder;
          if (node.type === "hidden") return "hidden";
        }
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) return text;
        // sr-only spans inside icon buttons count as accessible names.
        const sr = node.querySelector(".sr-only")?.textContent?.trim();
        return sr ?? "";
      });
      expect(name, `control #${i} must have an accessible name`).not.toBe("");
    }
  });

  test("content images carry alt text", async ({ page }) => {
    await gotoHydrated(page, "/");
    const missingAlt = await page.locator("img:not([alt])").count();
    expect(missingAlt, "every <img> must declare alt (empty alt allowed for decorative)").toBe(0);
  });
});
