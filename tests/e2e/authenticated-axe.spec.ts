import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import { gotoAuthenticated } from "../helpers/ui";

const AUTH_AXE_ROUTES = ["/chat", "/ops", "/phone", "/admin"] as const;

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  if (violations.length === 0) {
    return "No serious or critical WCAG 2.1 AA violations found.";
  }
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `- ${node.target.join(" ")}: ${node.failureSummary ?? "No failure summary"}`)
        .join("\n");
      return `${violation.id} [${violation.impact ?? "unknown"}] ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

test.describe("Accessibility — authenticated app surfaces", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  for (const path of AUTH_AXE_ROUTES) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await gotoAuthenticated(page, path);
      await expect(page.getByTestId("client-console")).toBeVisible({ timeout: 25_000 });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blockingViolations = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );

      expect(blockingViolations, formatViolations(blockingViolations)).toHaveLength(0);
    });
  }
});
