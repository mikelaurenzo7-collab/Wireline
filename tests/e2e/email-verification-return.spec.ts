import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`verification returns explain the next step without blocking sign-in at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [result, title] of [
      ["1", "Verification link accepted"],
      ["expired", "This verification link is no longer available"],
    ]) {
      const redirect = encodeURIComponent(`/studio?verified=${result}`);
      await page.goto(`/signin?redirect=${redirect}`);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(
        page.locator("form").getByRole("button", { name: "Sign In", exact: true }),
      ).toBeEnabled();
      const email = page.getByRole("textbox", { name: "Email", exact: true });
      await email.fill("pilot@example.test");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: "Password", exact: true })).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      const panel = page.getByRole("region", { name: "Account access" });
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`verification-${result}-${width}.png`),
        fullPage: true,
      });
    }
  });
}
