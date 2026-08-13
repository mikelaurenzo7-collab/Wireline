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
async function gotoPublicRouteWithMain(page: Page, route: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(route, { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    try {
      const main = page.getByRole("main");
      await expect(main.first(), `${route} should expose a main landmark`).toBeVisible({
        timeout: 30_000,
      });
      await expect(main, `${route} should expose exactly one main landmark`).toHaveCount(1);
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
    // Same cold-hydration discipline as the route loop above: the production
    // bundle's auth chunk takes >5s to mount on a cold serial worker, so anchor
    // on the hydrated main landmark before asserting on form controls.
    await gotoPublicRouteWithMain(page, "/signin");

    const editables = page.getByRole("textbox");
    await expect(editables.first()).toBeVisible({ timeout: 15_000 });

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

  test("signup consent errors move focus to the visible control and recover", async ({ page }) => {
    await gotoPublicRouteWithMain(page, "/signup");

    const consent = page.getByRole("checkbox", {
      name: "I agree to the Terms and Privacy Policy.",
    });
    await expect(consent).toBeVisible();

    const colors = await consent.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderTopColor,
        borderWidth: style.borderTopWidth,
      };
    });
    expect(colors.borderWidth).not.toBe("0px");
    expect(colors.border).not.toBe(colors.background);

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(consent).toBeFocused();
    await expect(consent).toHaveAttribute("aria-invalid", "true");
    await expect(consent).toHaveAttribute("aria-describedby", "auth-consent-error");
    const consentError = page.getByRole("alert");
    await expect(consentError).toHaveAttribute("id", "auth-consent-error");
    await expect(consentError).toContainText(
      "Accept the Terms and Privacy Policy above to continue.",
    );

    await consent.check();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(consent).toHaveAttribute("aria-invalid", "false");
  });
});
