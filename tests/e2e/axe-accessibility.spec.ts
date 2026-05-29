import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PUBLIC_ROUTES, gotoHydrated } from "../helpers/ui";

const REQUIRED_PAGES = new Set([
  "/",
  "/pricing",
  "/about",
  "/compare",
  "/showcase",
  "/status",
  "/changelog",
  "/security",
]);

const AXE_SCAN_ROUTES = Array.from(
  new Set([
    ...PUBLIC_ROUTES.filter(
      (route) => REQUIRED_PAGES.has(route.path) || route.path.startsWith("/blog"),
    ).map((route) => route.path),
    "/status",
    "/changelog",
    "/security",
  ]),
);

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

test.describe("Accessibility — axe WCAG 2.1 AA", () => {
  for (const path of AXE_SCAN_ROUTES) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await gotoHydrated(page, path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blockingViolations = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );
      const warningViolations = results.violations.filter((violation) =>
        ["moderate", "minor"].includes(violation.impact ?? ""),
      );

      if (warningViolations.length > 0) {
        console.warn(`axe warnings for ${path}:\n${formatViolations(warningViolations)}`);
      }

      expect(blockingViolations, formatViolations(blockingViolations)).toHaveLength(0);
    });
  }
});
