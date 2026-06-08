import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import {
  ALL_PUBLIC_MARKETING_PATHS,
  AUTHENTICATED_ROUTES,
  AUTHENTICATED_SUBTAB_SURFACES,
  AUTHENTICATED_TAB_DEEP_LINKS,
  VERTICAL_WEDGES,
  VIEWPORTS,
  gotoHydrated,
  gotoAuthenticated,
  openPublicMobileNav,
  assertNoHorizontalOverflow,
  assertSingleH1,
} from "../helpers/ui";
import {
  assertAppSurface,
  assertAuthPortalCanvas,
  assertAuthenticatedShell,
  assertBrandPrimaryToken,
  assertDirectorComposerDock,
  assertFocusRingToken,
  assertMarketingSurface,
  assertNoAuroraRingInApp,
  assertNoHeroAuroraOrbs,
  assertPaperBackground,
  assertReducedMotionHonored,
  assertScrollViewportInShell,
  assertWlPanelPresent,
} from "../helpers/design";

test.describe("Wireline design coverage — public inventory", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of ALL_PUBLIC_MARKETING_PATHS) {
    test(`${path} — marketing surface, brand tokens, layout`, async ({ page }) => {
      await gotoHydrated(page, path);
      await assertMarketingSurface(page);
      await assertBrandPrimaryToken(page);
      await assertPaperBackground(page);
      await assertFocusRingToken(page);
      await assertSingleH1(page);
      await assertNoHorizontalOverflow(page);
      await assertNoHeroAuroraOrbs(page);
    });
  }

  for (const wedge of VERTICAL_WEDGES) {
    test(`/for/${wedge.slug} — wedge headline + marketing shell`, async ({ page }) => {
      await gotoHydrated(page, `/for/${wedge.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(wedge.headline);
      await assertMarketingSurface(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test("reset-password uses auth cream canvas", async ({ page }) => {
    await gotoHydrated(page, "/reset-password");
    await assertAuthPortalCanvas(page);
  });

  test("/login redirects to sign-in with auth canvas", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/signin/);
    await assertAuthPortalCanvas(page);
  });
});

test.describe("Wireline design coverage — public interactions", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("landing FAQ accordion expands on click", async ({ page }) => {
    await gotoHydrated(page, "/");
    const firstFaq = page.getByTestId("faq-item-0");
    await firstFaq.click();
    await expect(firstFaq).toHaveAttribute("open");
  });

  test("sign-in ↔ sign-up mode switch keeps auth canvas", async ({ page }) => {
    await gotoHydrated(page, "/signin");
    await assertAuthPortalCanvas(page);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/create account/i);
    await assertAuthPortalCanvas(page);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome back/i);
  });

  test("mobile nav overlay opens and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/");
    await openPublicMobileNav(page);
    await expect(page.getByRole("link", { name: /pricing/i }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Site navigation" })).toBeHidden();
  });
});

test.describe("Wireline design coverage — public responsive", () => {
  for (const viewport of VIEWPORTS) {
    test(`landing at ${viewport.name} — no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoHydrated(page, "/");
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("Wireline design coverage — marketing while signed in", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("/pricing — dashboard CTA replaces sign-in funnel", async ({ page }) => {
    await gotoHydrated(page, "/pricing");
    await expect(page.getByTestId("header-dashboard")).toBeVisible();
    await expect(page.getByTestId("header-signin")).toHaveCount(0);
    await expect(page.getByTestId("header-cta")).toHaveCount(0);
    await assertMarketingSurface(page);
  });
});

test.describe("Wireline design coverage — authenticated routes", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route.path} — app shell, panels, no aurora-ring`, async ({ page }) => {
      await gotoAuthenticated(page, route.path);
      await assertAuthenticatedShell(page);
      await assertNoAuroraRingInApp(page);
      await assertBrandPrimaryToken(page);
      await assertFocusRingToken(page);
      await assertNoHorizontalOverflow(page);
      if (route.path !== "/chat") {
        await assertWlPanelPresent(page);
      }
    });
  }

  for (const deepLink of AUTHENTICATED_TAB_DEEP_LINKS) {
    test(`${deepLink} — deep link renders app shell`, async ({ page }) => {
      await gotoAuthenticated(page, deepLink);
      await assertAuthenticatedShell(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test("/chat — Director workspace + composer dock", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    await expect(page.getByTestId("director-workspace")).toBeVisible();
    await assertDirectorComposerDock(page);
    await assertSingleH1(page);
  });

  test("/integrations — integration hub panels", async ({ page }) => {
    await gotoAuthenticated(page, "/integrations");
    await assertWlPanelPresent(page);
  });
});

test.describe("Wireline design coverage — authenticated sub-tabs", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  for (const surface of AUTHENTICATED_SUBTAB_SURFACES) {
    test(`${surface.path} — every sub-tab selects and shows tabpanel`, async ({ page }) => {
      await gotoAuthenticated(page, surface.path);
      const tablist = page.getByRole("tablist", { name: surface.tablist });

      for (const label of surface.tabs) {
        const tab = tablist.getByRole("tab", { name: label, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        if (surface.path === "/admin" && label === "DNC") {
          await expect(page).toHaveURL(/\/dnc/);
        } else if (surface.path === "/admin" && label === "Audit") {
          await expect(page).toHaveURL(/\/audit/);
        } else {
          await expect(page.getByRole("tabpanel").first()).toBeVisible({ timeout: 15_000 });
        }
        await assertNoHorizontalOverflow(page);
      }
    });
  }
});

test.describe("Wireline design coverage — shell interactions", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("settings strip opens integrations hub", async ({ page }) => {
    await gotoAuthenticated(page, "/admin");
    await page.getByRole("tab", { name: "Integrations" }).click();
    await expect(page).toHaveURL(/\/integrations/);
    await assertWlPanelPresent(page);
  });

  test("sidebar navigates Chat → Phone → Live Ops", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    await page.getByRole("link", { name: "Phone", exact: true }).click();
    await expect(page).toHaveURL(/\/phone/);
    await assertAppSurface(page);

    await page.getByRole("link", { name: "Live Ops", exact: true }).click();
    await expect(page).toHaveURL(/\/ops/);
    await assertAppSurface(page);
  });

  test("theme toggle switches document to dark mode", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    const toggle = page.getByRole("button", {
      name: /switch to dark mode|switch to light mode/i,
    });
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await assertBrandPrimaryToken(page);
  });

  test("keyboard shortcuts overlay opens with ?", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("scroll-viewport present in authenticated shell", async ({ page }) => {
    await gotoAuthenticated(page, "/ops");
    await assertScrollViewportInShell(page);
  });
});

test.describe("Wireline design coverage — mobile authenticated shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, baseURL!);
  });

  for (const path of ["/chat", "/phone", "/ops", "/agents", "/integrations", "/admin"] as const) {
    test(`${path} — mobile shell integrity`, async ({ page }) => {
      await gotoAuthenticated(page, path);
      await assertAuthenticatedShell(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test("mobile drawer opens from Open navigation control", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
  });

  test("mobile drawer reaches Phone from chat", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await page.getByRole("link", { name: "Phone", exact: true }).click();
    await expect(page).toHaveURL(/\/phone/);
    await assertNoHorizontalOverflow(page);
  });

  test("/training — exactly one h1 (workspace title, not agent name)", async ({ page }) => {
    await gotoAuthenticated(page, "/training");
    await assertSingleH1(page);
    await expect(page.getByRole("heading", { level: 1, name: /training/i })).toBeVisible();
  });

  test("/integrations — workspace subtitle renders once on mobile", async ({ page }) => {
    await gotoAuthenticated(page, "/integrations");
    const bar = page.locator(".workspace-top-bar");
    await expect(bar.getByText(/email, crm & third-party/i)).toHaveCount(1);
    await assertNoHorizontalOverflow(page);
  });
});

test.describe("Wireline design coverage — motion", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("prefers-reduced-motion dampens tab animations on /phone", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoAuthenticated(page, "/phone");
    await page.getByRole("tab", { name: "Outbound" }).click();
    await assertReducedMotionHonored(page);
  });
});
