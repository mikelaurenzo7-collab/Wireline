import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/about",
  "/security",
  "/support",
  "/contact",
  "/signin",
];

test.describe("accessibility smoke gate", () => {
  for (const route of routes) {
    test(`${route} has no automated WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();

      await page.addStyleTag({
        content: "*,*::before,*::after{transition-duration:0.001ms!important;animation-duration:0.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}",
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
            const nodes = violation.nodes
              .map((node) => `  - ${node.target.join(", ")}`)
              .join("\n");
            return `${violation.id}: ${violation.help}\n${nodes}`;
          })
          .join("\n\n"),
      ).toEqual([]);
    });
  }
});
