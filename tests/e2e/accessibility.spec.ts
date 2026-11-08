import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isMarketingHomePath, isMarketingPublicPath } from "../../src/lib/public-routes";

const routes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/about",
  "/security",
  "/support",
  "/contact",
  "/sms-consent",
  "/signin",
];

test.describe("accessibility smoke gate", () => {
  for (const route of routes) {
    test(`${route} has no automated WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "commit" });
      await expect(page.locator("main").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const pathname = new URL(page.url()).pathname;
      if (isMarketingHomePath(pathname) || isMarketingPublicPath(pathname)) {
        // Motion's JS-driven entrance is not disabled by the CSS override
        // below. Audit the complete notice, including its real contrast,
        // once it has reached its rendered opacity rather than mid-fade.
        await expect(page.getByRole("region", { name: "Privacy Choices" })).toHaveCSS(
          "opacity",
          "1",
        );
      }

      await page.addStyleTag({
        content:
          "*,*::before,*::after{transition-duration:0.001ms!important;animation-duration:0.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}",
      });

      const title = await page.title();
      expect(title.trim().length).toBeGreaterThan(0);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(
        results.violations,
        results.violations
          .map((violation) => {
            const nodes = violation.nodes.map((node) => `  - ${node.target.join(", ")}`).join("\n");
            return `${violation.id}: ${violation.help}\n${nodes}`;
          })
          .join("\n\n"),
      ).toEqual([]);
    });
  }
});
