import { test, expect } from "@playwright/test";
import {
  PUBLIC_ROUTES,
  VERTICAL_WEDGES,
  VIEWPORTS,
  assertNoHorizontalOverflow,
  assertSingleH1,
} from "../helpers/ui";

/**
 * Marketing & auth surface integrity.
 *
 * Replaces the pixel-baseline visual suite with behavioural design
 * invariants: every prospect-facing page loads, carries a clean document
 * outline (one h1, correct title), renders the persistent site chrome,
 * and never scrolls horizontally — on phone, tablet, and desktop.
 */
test.describe("Marketing surfaces — layout & design integrity", () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}×${viewport.height})`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of PUBLIC_ROUTES) {
        test(`${route.path} renders cleanly`, async ({ page }) => {
          await page.goto(route.path);

          await expect(page).toHaveTitle(route.title);
          await expect(page.getByTestId("site-header")).toBeVisible();
          await assertSingleH1(page);
          await assertNoHorizontalOverflow(page);
        });
      }
    });
  }
});

test.describe("Marketing surfaces — primary conversion path", () => {
  test("landing surfaces a trial CTA that points at signup", async ({ page }) => {
    await page.goto("/");

    const trialCta = page.getByRole("link", { name: /start free trial/i }).first();
    await expect(trialCta).toBeVisible();
    await expect(trialCta).toHaveAttribute("href", /\/signup/);
  });

  test("desktop header exposes sign-in and start-trial actions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByTestId("header-signin")).toBeVisible();
    await expect(page.getByTestId("header-cta")).toBeVisible();
    await expect(page.getByTestId("header-cta")).toHaveAttribute("href", /\/signup/);
  });

  test("pricing tiers each route to signup with a plan intent", async ({ page }) => {
    await page.goto("/pricing");

    const planCtas = page.getByRole("link", { name: /start free trial/i });
    await expect(planCtas.first()).toBeVisible();

    const hrefs = await planCtas.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")).filter((h): h is string => !!h),
    );
    const planLinks = hrefs.filter((h) => h.includes("/signup?plan="));
    expect(
      planLinks.length,
      "every pricing tier carries a plan-scoped signup link",
    ).toBeGreaterThan(0);
    for (const href of planLinks) {
      expect(href).toMatch(/\/signup\?plan=(personal|starter|pro|business)/);
    }
  });
});

test.describe("Marketing surfaces — vertical wedge landings (all client types)", () => {
  for (const wedge of VERTICAL_WEDGES) {
    test(`/for/${wedge.slug} renders its industry headline`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/for/${wedge.slug}`);

      await expect(page.getByRole("heading", { level: 1 })).toContainText(wedge.headline);
      await assertNoHorizontalOverflow(page);
    });
  }
});
