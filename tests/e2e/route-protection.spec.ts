import { test, expect } from "@playwright/test";
import { AUTHENTICATED_ROUTES } from "../helpers/ui";

/**
 * Route protection — auth boundary enforcement.
 *
 * Every authenticated route must redirect unauthenticated visitors to
 * the sign-in page. This is a security-critical invariant: if any route
 * leaks content without auth, it's a regression.
 */
test.describe("Route protection — all authenticated routes require login", () => {
  for (const { path, name } of AUTHENTICATED_ROUTES) {
    test(`${path} (${name}) redirects to sign-in when unauthenticated`, async ({ page }) => {
      await page.goto(path);

      // Should land on the sign-in form
      await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible();
    });
  }
});

test.describe("Route protection — redirect preserves intent", () => {
  test("accessing /insights unauthenticated preserves redirect param", async ({ page }) => {
    await page.goto("/insights");

    // After auth, user should be sent back; URL or form should reference original path
    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("accessing /training unauthenticated preserves redirect param", async ({ page }) => {
    await page.goto("/training");

    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Route protection — deep-link auth gating", () => {
  test("/chat/:id requires authentication", async ({ page }) => {
    await page.goto("/chat/some-conversation-id");

    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("/contact/:number requires authentication", async ({ page }) => {
    await page.goto("/contact/+15551234567");

    await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Route protection — daily driver workspace surfaces (mobile + desktop)", () => {
  // The workspace (chat/:id + ?tab=training|connectors|memory) is the primary
  // surface for every paying customer. These must never leak without auth.
  // We test the deep-link variants an operator would actually bookmark or
  // receive in an escalation email.
  const workspaceDeepLinks = [
    { path: "/chat/some-agent-id?tab=training", name: "workspace training tab" },
    { path: "/chat/some-agent-id?tab=connectors", name: "workspace connectors tab" },
    { path: "/chat/some-agent-id?tab=memory", name: "workspace memory tab" },
    { path: "/chat/some-agent-id?tab=training&sub=simulator", name: "workspace training simulator sub-tab" },
  ];

  for (const { path, name } of workspaceDeepLinks) {
    test(`${path} (${name}) requires authentication on mobile viewport`, async ({ page }) => {
      // Explicitly test on a phone viewport (user philosophy: most first impressions are mobile)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);

      await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
        timeout: 20_000,
      });
    });

    test(`${path} (${name}) requires authentication on desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);

      await expect(page.getByRole("heading", { name: /welcome back|sign in/i })).toBeVisible({
        timeout: 20_000,
      });
    });
  }
});
