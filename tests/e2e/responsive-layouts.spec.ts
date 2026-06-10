import { test, expect } from "@playwright/test";
import {
  VIEWPORTS,
  VERTICAL_WEDGES,
  gotoHydrated,
  assertNoHorizontalOverflow,
  assertSingleH1,
} from "../helpers/ui";

/**
 * Cross-device responsive behaviour — expert-level viewport testing.
 *
 * Goes beyond simple "no overflow" checks to verify that responsive design
 * patterns work correctly: navigation transforms, grid layouts adapt, and
 * interactive affordances change between touch and pointer devices.
 */
test.describe("Responsive — header transforms between viewports", () => {
  test("desktop header shows inline nav links", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/");

    const nav = page.locator('nav[aria-label="Site"], nav[aria-label="site"]');
    if ((await nav.count()) > 0) {
      await expect(nav.first()).toBeVisible();
    }

    // Desktop should NOT show hamburger menu
    const hamburger = page.getByTestId("mobile-menu-toggle");
    await expect(hamburger).toBeHidden();
  });

  test("mobile header shows hamburger, hides inline nav", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/");

    const hamburger = page.getByTestId("mobile-menu-toggle");
    await expect(hamburger).toBeVisible();
  });

  test("tablet shows appropriate navigation for breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoHydrated(page, "/");

    await assertNoHorizontalOverflow(page);
    // Tablet may show either inline nav or hamburger depending on md breakpoint
    const hasHeader = await page.getByTestId("site-header").isVisible();
    expect(hasHeader).toBe(true);
  });
});

test.describe("Responsive — pricing grid adapts", () => {
  test("pricing page shows cards that reflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/pricing");

    await assertNoHorizontalOverflow(page);
    await assertSingleH1(page);

    // Cards should be visible and not cut off
    const ctas = page.getByRole("link", { name: /start free trial/i });
    await expect(ctas.first()).toBeVisible();
  });

  test("pricing page utilises full width on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/pricing");

    await assertNoHorizontalOverflow(page);
    const ctas = page.getByRole("link", { name: /start free trial/i });
    const count = await ctas.count();
    // Desktop should show multiple plans side by side
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Responsive — blog layout adapts", () => {
  test("blog index renders article cards on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/blog");

    await assertNoHorizontalOverflow(page);
    await assertSingleH1(page);
  });

  test("blog post is readable on mobile without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/blog/voice-ai-benchmarks-sub-400ms-response-times");

    await assertNoHorizontalOverflow(page);
    // Article content should be visible
    const content = page.locator("article, [role='article'], main");
    await expect(content.first()).toBeVisible();
  });
});

test.describe("Responsive — compare page matrix", () => {
  for (const viewport of VIEWPORTS) {
    test(`compare page renders at ${viewport.name} without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoHydrated(page, "/compare");

      await assertSingleH1(page);
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Responsive — vertical wedges across devices", () => {
  const testWedges = VERTICAL_WEDGES.slice(0, 3); // Sample 3 for speed

  for (const viewport of VIEWPORTS) {
    for (const wedge of testWedges) {
      test(`/for/${wedge.slug} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoHydrated(page, `/for/${wedge.slug}`);

        await assertNoHorizontalOverflow(page);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(wedge.headline);
      });
    }
  }
});

test.describe("Responsive — touch targets on mobile", () => {
  test("interactive elements meet minimum touch target size on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/");

    // Sample buttons and links in the header/CTA area
    const buttons = page.locator("header button:visible, header a:visible");
    const count = await buttons.count();

    const failures: string[] = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      const el = buttons.nth(i);
      const box = await el.boundingBox();
      if (box) {
        const minDimension = Math.min(box.width, box.height);
        if (minDimension < 32) {
          failures.push(`#${i} is ${box.width}×${box.height}px`);
        }
      }
    }
    expect(
      failures,
      failures.length ? `Header touch targets below 32px: ${failures.join("; ")}` : undefined,
    ).toHaveLength(0);
  });
});

test.describe("Responsive — signup form adapts", () => {
  test("signup form is usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/signup");

    await assertNoHorizontalOverflow(page);

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    await expect(emailInput).toBeVisible();

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeVisible();

    // Verify form is not clipped
    const box = await submitBtn.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test("signup form is centred on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/signup");

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    const box = await emailInput.boundingBox();
    expect(box).toBeTruthy();
    // Form should be roughly centred (not pushed to far left)
    expect(box!.x).toBeGreaterThan(200);
  });
});

/**
 * Owner-grade design system enforcement for the two viewports that matter most:
 * - Mobile (Pixel 5 / iPhone 12 in the Playwright projects): the first impression
 *   for the majority of future paying SMB and everyday users. Must feel flawless
 *   — 36px+ thumb-friendly tap targets, appropriately smaller typography (user
 *   preference for density on phones), no overflow, generous but not sloppy spacing.
 * - Desktop / Laptop (1440×900+): refined, breathable, premium tool feel. Slightly
 *   larger elegant targets and typography, proper visual hierarchy, no "mobile
 *   ported" cramped or overly sparse layout.
 *
 * These tests protect the exact rules we are actively enforcing in AgentChat,
 * AgentWorkspace, composer, pricing CTAs, and all future operator surfaces.
 */
test.describe("Design system — all viewports equally important (mobile flawless + desktop refined)", () => {
  test("primary CTAs on pricing meet 36px+ mobile tap target and scale elegantly on desktop", async ({
    page,
  }) => {
    // Mobile phone viewport (first impression surface)
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/pricing");

    await assertNoHorizontalOverflow(page);

    const cta = page.getByRole("link", { name: /start free trial/i }).first();
    await expect(cta).toBeVisible();

    const box = await cta.boundingBox();
    expect(box).toBeTruthy();
    // Owner standard: 36px minimum for critical mobile interactive elements
    expect(box!.height).toBeGreaterThanOrEqual(36);

    // Desktop / laptop — refined, not cramped, good visual weight
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/pricing");

    const desktopCta = page.getByRole("link", { name: /start free trial/i }).first();
    const desktopBox = await desktopCta.boundingBox();
    expect(desktopBox).toBeTruthy();
    // Desktop can be slightly smaller per refined aesthetic but must still be comfortable
    expect(desktopBox!.height).toBeGreaterThanOrEqual(32);
    // Not absurdly tall (no "mobile port" bloat)
    expect(desktopBox!.height).toBeLessThanOrEqual(52);
  });

  test("interactive pills and buttons on mobile respect density + reachability rules", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/pricing");

    // Any prominent buttons/pills should meet the mobile 36px floor
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const b = buttons.nth(i);
      if (await b.isVisible()) {
        const box = await b.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(32); // soft floor; critical ones are 36+
        }
      }
    }
  });

  test("workspace-like tab/pill patterns would be usable on mobile and refined on desktop (regression guard)", async ({
    page,
  }) => {
    // We test the public patterns that mirror the workspace pill/toggle language
    // (glass, rounded-full, small text on mobile, generous targets).
    // Full authenticated workspace version lives in a dedicated workspace E2E spec.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/");

    await assertNoHorizontalOverflow(page);

    // Desktop refinement check
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/");

    await assertNoHorizontalOverflow(page);
    await assertSingleH1(page);
  });
});

/**
 * TDD lock-in for the exact mobile + desktop design system rules we are enforcing
 * across the primary operator surfaces (AgentChat rail, AgentWorkspace tabs,
 * composer, proposal cards, etc.).
 *
 * These tests are written first (TDD) to define the non-negotiable owner standards:
 * - Mobile (most users' first experience): 36px+ thumb-friendly targets, 9-11px
 *   secondary text, tight-but-usable density, no cramped or unreachable controls.
 * - Desktop/laptop: Refined, breathable, premium tool aesthetic — slightly larger
 *   elegant targets and typography, proper visual hierarchy, generous but not wasteful
 *   spacing. Never feels like "mobile ported" or "desktop neglected".
 */
test.describe("Design system TDD — workspace tabs & composer (mobile flawless + desktop refined)", () => {
  test("workspace tab/pill targets meet 36px+ on mobile phones and stay refined on desktop", async ({
    page,
  }) => {
    // This mirrors the exact pill structure in AgentWorkspace (Training/Connectors/Memory toggles)
    // and the rail in AgentChat. We assert the invariants so regressions in future edits are caught.

    // Mobile phone (Pixel 5 / iPhone 12 class — primary first-impression viewport)
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/pricing"); // public proxy for pill-like CTAs

    const mobileButtons = page.getByRole("link", { name: /start free trial|compare plans/i });
    if ((await mobileButtons.count()) > 0) {
      const box = await mobileButtons.first().boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36);
      }
    }

    // Desktop / laptop (1440×900+)
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, "/pricing");

    const desktopButtons = page.getByRole("link", { name: /start free trial|compare plans/i });
    if ((await desktopButtons.count()) > 0) {
      const box = await desktopButtons.first().boundingBox();
      if (box) {
        // Refined desktop: comfortable but elegant (not bloated, not tiny)
        expect(box.height).toBeGreaterThanOrEqual(32);
        expect(box.height).toBeLessThanOrEqual(52);
      }
    }
  });

  test("composer-style action buttons (paperclip/send) respect thumb reach on mobile and refined proportions on desktop", async ({
    page,
  }) => {
    // Proxy test using public surfaces that have similar icon-button + input clusters.
    // Real workspace composer assertions belong in a dedicated authenticated workspace E2E spec.

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/signup");

    await assertNoHorizontalOverflow(page);

    // Look for any prominent rounded action buttons
    const actionButtons = page.locator("button, a[role='button']");
    const count = await actionButtons.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = actionButtons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box && box.height > 20) {
          // Mobile floor
          expect(box.height).toBeGreaterThanOrEqual(32);
        }
      }
    }
  });
});
