import { test, expect } from "@playwright/test";

for (const width of [320, 375, 390] as const) {
  for (const path of ["/", "/pricing", "/features"] as const) {
    test(`first-visit mobile privacy notice does not move ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        localStorage.removeItem("wireline_cookie_consent");
        localStorage.removeItem("wireline_marketing_measurement_consent");
      });

      let answerSession: (() => void) | undefined;
      await page.route("**/api/auth/session", async (route) => {
        await new Promise<void>((resolve) => { answerSession = resolve; });
        await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      });
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const hero = page.getByRole("heading", { level: 1 }).first();
      await expect(hero).toBeVisible();
      await expect.poll(() => Boolean(answerSession)).toBe(true);
      const notice = page.getByRole("region", { name: "Privacy Choices" });
      // A slow session probe must not silently turn this into a post-notice measurement.
      await expect(notice).toHaveCount(0);
      const before = await hero.boundingBox();
      const reserve = page.locator("#wl-mobile-privacy-prepaint");
      await expect(reserve).toHaveCSS("display", "block");
      expect(await reserve.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(150);
      answerSession?.();

      await expect(notice).toBeVisible();
      const after = await hero.boundingBox();
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.y - before!.y)).toBeLessThan(10);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      const menu = page.getByRole("button", { name: "Toggle navigation menu" });
      await menu.click();
      await expect(notice).toBeHidden();
      await menu.click();
      await expect(notice).toBeVisible();
    });
  }

  for (const path of ["/", "/pricing", "/features"] as const) {
    test(`Bot creation skips the privacy reservation on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => localStorage.removeItem("wireline_cookie_consent"));
      await page.goto(`${path}?create=1`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#wl-mobile-privacy-prepaint")).toHaveCSS("display", "none");
      await expect(page.getByRole("region", { name: "Privacy Choices" })).toHaveCount(0);
    });
  }

  test(`in-app Bot creation clears an already reserved first-visit strip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.removeItem("wireline_cookie_consent"));
    let releaseSession: (() => void) | undefined;
    await page.route("**/api/auth/session", async (route) => {
      await new Promise<void>((resolve) => { releaseSession = resolve; });
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const slot = page.locator("#wl-mobile-privacy-prepaint");
    await expect(slot).toHaveCSS("display", "block");
    await page.evaluate(() => {
      window.history.pushState({}, "", "/?create=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(slot).toHaveCSS("display", "none");
    releaseSession?.();
    await expect(page.getByRole("region", { name: "Privacy Choices" })).toHaveCount(0);
  });

  test(`returning visitor has no reserved mobile privacy gap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem("wireline_cookie_consent", "acknowledged"));
    await page.goto("/");
    await expect(page.locator("#wl-mobile-privacy-prepaint")).toHaveCSS("display", "none");
    await expect(page.getByRole("region", { name: "Privacy Choices" })).toHaveCount(0);
  });
}
