import { expect, test, type Locator, type Page } from "@playwright/test";
import { STRIPE_PLANS } from "../../src/lib/plan-catalog";

async function mockWorkspace(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/auth/session"
        ? {
            user: {
              id: "design-owner",
              email: "owner@example.test",
              full_name: "Design Review",
              email_verified_at: "2026-09-25T00:00:00Z",
            },
          }
        : path === "/api/agents"
          ? { agents: [{ id: "design-bot", name: "Front Desk", role: "receptionist" }] }
          : path === "/api/agent-config/design-bot"
            ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
            : path === "/api/billing/plans"
              ? {
                  checkout_available: false,
                  stripe_configured: true,
                  plans: STRIPE_PLANS.map((plan) => ({
                    ...plan,
                    is_free: plan.id === "personal",
                    configured: true,
                    annual_configured: true,
                  })),
                }
              : path === "/api/billing/status"
                ? { stripe_configured: true, subscription: null, agent_count: 1 }
                : {
                    accounts: [],
                    data: [],
                    numbers: [],
                    integrations: [],
                    messages: [],
                    threads: [],
                  };
    await route.fulfill({ json });
  });
}

async function enlargeText(page: Page) {
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
}

async function expectContentFits(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluateAll((elements) =>
        elements
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              element.clientWidth > 1 && style.overflowX !== "auto" && style.overflowX !== "scroll"
            );
          })
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 50)}`),
      ),
    )
    .toEqual([]);
}

test("pricing keeps its header, annual prices, and both mobile actions readable at 320px and 200% text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockWorkspace(page);
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await enlargeText(page);
  await expectContentFits(
    page.locator(
      "#plans, #plans *, .wl-public-header a:not(.wl-skip-link), .wl-public-header button",
    ),
  );

  const header = page.locator(".wl-public-header");
  const heading = page.getByRole("heading", { level: 1 });
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await header.boundingBox())!.height,
  );
  const interval = page.getByRole("group", { name: "Billing interval" });
  await interval.getByRole("button", { name: "Annual", exact: true }).click();
  await expect(interval.getByRole("button", { name: "Annual", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const starter = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Starter", exact: true }) });
  await expect(starter).toContainText("190");
  await expect(starter.getByRole("link", { name: "Set up Starter", exact: true })).toHaveAttribute(
    "href",
    /interval=year/,
  );

  await page.locator(".pricing-more__summary").scrollIntoViewIfNeeded();
  await expect(page.locator(".marketing-sticky-cta")).toBeVisible();
  await expectContentFits(page.locator(".marketing-sticky-cta, .marketing-sticky-cta *"));
  for (const action of await page.locator(".marketing-sticky-cta a").all()) {
    const box = (await action.boundingBox())!;
    expect(box.width).toBeGreaterThan(100);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await header.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("menuitem", { name: "Pricing", exact: true })).toBeVisible();
  const menuBox = (await page.getByRole("menu").boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(header.getByRole("button", { name: "Open navigation" })).toBeFocused();
});

test("billing reflows its interval, cards, and dock without losing bottom actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockWorkspace(page);
  await page.goto("/settings/billing");
  const interval = page.getByRole("group", { name: "Billing interval" });
  await expect(interval).toBeVisible();
  await enlargeText(page);
  await interval.getByRole("button", { name: "Annual", exact: true }).click();
  await expectContentFits(page.locator(".wl-billing-plans, .wl-billing-plans *, .wl-shell-dock *"));
  const starter = page
    .locator(".wl-billing-plan")
    .filter({ has: page.getByRole("heading", { name: "Starter", exact: true }) });
  await expect(starter).toContainText("190");
  await expect(starter.getByRole("button", { name: "Checkout paused" })).toBeDisabled();
  const rows = await page
    .locator(".wl-shell-dock-item")
    .evaluateAll(
      (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
    );
  expect(rows).toBe(2);

  const terms = page.getByRole("link", { name: "Terms", exact: true });
  await terms.scrollIntoViewIfNeeded();
  const termsBox = (await terms.boundingBox())!;
  const dockBox = (await page.locator(".wl-shell-dock").boundingBox())!;
  expect(termsBox.y + termsBox.height).toBeLessThanOrEqual(dockBox.y);
  await page.getByRole("button", { name: "More destinations" }).click();
  await expect(page.getByRole("dialog", { name: "More", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More destinations" })).toBeFocused();
});

test("Studio retains a draft and exposes the final action after text enlargement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  const greeting = page.getByRole("textbox", { name: "Opening greeting", exact: true });
  const draft = "Welcome to the repair desk. How can I help?";
  await greeting.fill(draft);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await expect(greeting).toHaveValue(draft);
  await page.setViewportSize({ width: 320, height: 800 });
  await enlargeText(page);
  await expectContentFits(page.locator("#studio-inspector, #studio-inspector *, .wl-shell-dock *"));
  const lastAction = page
    .locator("#studio-inspector")
    .getByRole("link", { name: "Connections", exact: true });
  await lastAction.scrollIntoViewIfNeeded();
  const actionBox = (await lastAction.boundingBox())!;
  const dockBox = (await page.locator(".wl-shell-dock").boundingBox())!;
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(dockBox.y);
  await page.getByRole("button", { name: "Close Bot settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make this Bot your own" })).toBeVisible();
  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).not.toHaveValue("");
});
