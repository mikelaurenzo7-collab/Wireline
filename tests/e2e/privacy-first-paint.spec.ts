import { test, expect } from "@playwright/test";

for (const width of [320, 375] as const) {
  test(`first-visit mobile privacy notice does not move the homepage at ${width}px`, async ({ page }) => {
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
    await page.goto("/");

    const hero = page.getByRole("heading", { level: 1 });
    await expect(hero).toBeVisible();
    await expect.poll(() => Boolean(answerSession)).toBe(true);
    const before = await hero.boundingBox();
    const reserve = page.locator("#wl-mobile-privacy-prepaint");
    await expect(reserve).toHaveCSS("display", "block");
    expect(await reserve.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(150);
    answerSession?.();

    const notice = page.getByRole("region", { name: "Privacy Choices" });
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

  test(`returning visitor has no reserved mobile privacy gap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem("wireline_cookie_consent", "acknowledged"));
    await page.goto("/");
    await expect(page.locator("#wl-mobile-privacy-prepaint")).toHaveCSS("display", "none");
    await expect(page.getByRole("region", { name: "Privacy Choices" })).toHaveCount(0);
  });
}
