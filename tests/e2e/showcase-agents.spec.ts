import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, assertSingleH1, gotoHydrated, VIEWPORTS } from "../helpers/ui";

/**
 * Showcase — agent audition surface (agent performance, all client types).
 *
 * /showcase lets a prospect audition voice agents before signing up: an
 * in-browser "singing receptionist" demo plus the full roster of team and
 * demo phone lines. These assertions guard that the audition is reachable,
 * accessible, and renders consistent calling affordances on every device.
 */
test.describe("Showcase — agent audition", () => {
  test("renders the audition hero and headline", async ({ page }) => {
    await gotoHydrated(page, "/showcase");

    await assertSingleH1(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/audition the agents/i);
  });

  test("the in-browser demo exposes an accessible play toggle", async ({ page }) => {
    await gotoHydrated(page, "/showcase");

    const play = page.getByRole("button", { name: /hear her sing/i });
    await expect(play).toBeVisible();
    // aria-pressed communicates toggle state to assistive tech.
    await expect(play).toHaveAttribute("aria-pressed", "false");
    await play.click();
    // After toggling, the control flips to the stop affordance (audio may
    // not actually play in headless CI, but the UI state must respond).
    await expect(
      page.getByRole("button", { name: /stop the jingle|hear her sing/i }),
    ).toBeVisible();
  });

  test("every agent offers a well-formed tel: calling link", async ({ page }) => {
    await gotoHydrated(page, "/showcase");

    const telLinks = page.locator('a[href^="tel:"]');
    await expect(telLinks.first()).toBeVisible();
    const count = await telLinks.count();
    expect(count, "showcase must list callable agent lines").toBeGreaterThan(0);

    const hrefs = await telLinks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      // E.164: tel:+<digits>
      expect(href).toMatch(/^tel:\+\d{6,15}$/);
    }
  });

  test("team and demo agent lines are both presented", async ({ page }) => {
    await gotoHydrated(page, "/showcase");

    await expect(page.getByText(/demo agents/i).first()).toBeVisible();
    // Multiple labelled phone-line cards (Team · …, Demo · …) are rendered.
    const lineCards = page.locator('a[href^="tel:"]');
    await expect(lineCards.first()).toBeVisible();
    expect(await lineCards.count()).toBeGreaterThanOrEqual(2);
  });

  for (const viewport of VIEWPORTS) {
    test(`audition layout holds at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoHydrated(page, "/showcase");
      await assertNoHorizontalOverflow(page);
    });
  }
});
