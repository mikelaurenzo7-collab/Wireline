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
                    catalog_family: plan.catalogFamily,
                    checkout_availability: plan.checkoutAvailability,
                    is_free: plan.id === "personal",
                    configured: true,
                    annual_configured: true,
                  })),
                }
              : path === "/api/billing/status"
                ? {
                    stripe_configured: true,
                    subscription: null,
                    agent_count: 1,
                    channel_entitlements: {
                      plan_id: "omnichannel",
                      subscription_status: "active",
                      channels: ["voice", "email", "sms"],
                      is_owner: false,
                    },
                  }
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

for (const viewport of [
  { width: 1440, height: 900, largeText: false },
  { width: 768, height: 900, largeText: false },
  { width: 390, height: 844, largeText: false },
  { width: 320, height: 844, largeText: true },
]) {
  test(`activation plans remain readable at ${viewport.width}px${viewport.largeText ? " with enlarged text" : ""}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockWorkspace(page);
    await page.route("**/api/phone-numbers/available", (route) =>
      route.fulfill({
        status: 402,
        json: { code: "ACTIVATION_REQUIRED", error: "Activate a paid plan." },
      }),
    );
    await page.goto("/phone?tab=setup");
    await expect(page.getByText(/Couldn't check your email status/)).toBeVisible();
    if (viewport.largeText) await enlargeText(page);
    // The selected dock/rail item and Lines tab already provide visual context.
    // Keep semantic headings without letting them occupy a second title band.
    for (const name of ["Calls", "Lines"]) {
      const heading = page.getByRole("heading", { name, exact: true });
      await expect(heading).toHaveCount(1);
      expect((await heading.boundingBox())?.height).toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "Add line", exact: true }).click();
    await page.getByRole("button", { name: "Find numbers", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Go live", exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Checkout is temporarily unavailable. Your Bot is saved.", { exact: true }),
    ).toBeVisible();
    const plans = dialog.getByRole("button", { name: "Checkout paused", exact: true });
    await expect(plans).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(dialog.locator(":scope > div")).toHaveCSS("opacity", "1");
    await testInfo.attach(`activation-${viewport.width}`, {
      path: await page
        .screenshot({ path: testInfo.outputPath(`activation-${viewport.width}.png`) })
        .then(() => testInfo.outputPath(`activation-${viewport.width}.png`)),
      contentType: "image/png",
    });
    await dialog.getByText("View plans", { exact: true }).click();
    await expect(plans).toHaveCount(1);
    await expect(dialog.getByRole("checkbox")).toHaveCount(3);
    await expect(plans).toBeDisabled();
    const packageCard = dialog.getByRole("article", { name: "Selected package" });
    const geometry = await packageCard.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
      overflow: [...element.querySelectorAll("*")]
        .filter((child) => child.clientWidth > 0 && child.scrollWidth > child.clientWidth + 1)
        .map((child) => ({
          text: child.textContent,
          width: child.clientWidth,
          scroll: child.scrollWidth,
        })),
    }));
    expect(geometry.width).toBeGreaterThan(150);
    expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.overflow).toEqual([]);
    await testInfo.attach(`activation-plans-${viewport.width}`, {
      path: await page
        .screenshot({ path: testInfo.outputPath(`activation-plans-${viewport.width}.png`) })
        .then(() => testInfo.outputPath(`activation-plans-${viewport.width}.png`)),
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

test("Activity keeps its document heading without repeating the selected navigation label", async ({
  page,
}, testInfo) => {
  await mockWorkspace(page);
  await page.route("**/api/billing/status", (route) =>
    route.fulfill({
      json: {
        stripe_configured: true,
        subscription: null,
        agent_count: 1,
        email_verified: true,
      },
    }),
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.goto("/insights");
    const heading = page.getByRole("heading", { level: 1, name: "Activity", exact: true });
    await expect(heading).toHaveCount(1);
    expect((await heading.boundingBox())?.height).toBeLessThanOrEqual(1);
    await expect(page.getByRole("combobox", { name: "Activity view" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await testInfo.attach(`activity-${width}`, {
      path: await page
        .screenshot({ path: testInfo.outputPath(`activity-${width}.png`), animations: "disabled" })
        .then(() => testInfo.outputPath(`activity-${width}.png`)),
      contentType: "image/png",
    });
  }
});

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

test("workspace actions share readable typography in both themes", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/settings/billing");
  const builder = page.getByRole("link", { name: "Open Free Builder", exact: true });
  await expect(builder).toBeVisible();
  for (const light of [false, true]) {
    await page.evaluate(async (light) => {
      document.documentElement.classList.toggle("light", light);
      await document.fonts.ready;
    }, light);
    for (const action of [builder, page.getByRole("button", { name: "Annual", exact: true })]) {
      const type = await action.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          size: parseFloat(style.fontSize),
          weight: Number(style.fontWeight),
          transform: style.textTransform,
        };
      });
      expect(type.family).toContain("Inter");
      expect(type.family).not.toMatch(/Mono|monospace/);
      expect(type.size).toBeGreaterThanOrEqual(14);
      expect(type.weight).toBeGreaterThanOrEqual(600);
      expect(type.transform).toBe("none");
    }
    await expectContentFits(page.locator(".wl-billing-plans, .wl-billing-plans *"));
  }
  await builder.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/studio/);
});

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
  const currentPlan = STRIPE_PLANS.find((plan) => plan.id === "voice-regular")!;
  const selectedPackage = page.getByRole("article", { name: "Selected package" });
  await expect(
    selectedPackage.getByRole("heading", {
      name: currentPlan.name.replace(/^BotBound\s+/, ""),
      exact: true,
    }),
  ).toBeVisible();
  await expect(selectedPackage).toContainText(
    `$${currentPlan.price_usd_annual.toLocaleString()}/year`,
  );
  await expect(
    selectedPackage.getByRole("link", { name: "Build with these channels", exact: true }),
  ).toHaveAttribute("href", `/signup?plan=${currentPlan.id}&interval=year`);
  await expectContentFits(page.locator("#plans, #plans *"));

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
  const callsPlan = STRIPE_PLANS.find((plan) => plan.id === "voice-regular")!;
  const selectedPackage = page.getByRole("article", { name: "Selected package" });
  await expect(
    selectedPackage.getByRole("heading", {
      name: callsPlan.name.replace(/^BotBound\s+/, ""),
      exact: true,
    }),
  ).toBeVisible();
  await expect(selectedPackage).toContainText(
    `$${callsPlan.price_usd_annual.toLocaleString()}/year`,
  );
  await expect(selectedPackage.getByRole("button", { name: "Checkout paused" })).toBeDisabled();
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
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  await expect(page.getByText(/Couldn't check your email status/)).toBeVisible();
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
  // A user can stop partway through the notice rail before scrolling settings.
  // The nested scroll target must clear the dock from this position as well.
  await page.locator(".wl-workspace-content").evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  await lastAction.scrollIntoViewIfNeeded();
  try {
    // Font readiness precedes the dock ResizeObserver's clearance update.
    // Re-read geometry while that settles; persistent overlap must still fail.
    await expect
      .poll(
        async () => {
          const actionBox = await lastAction.boundingBox();
          const dockBox = await page.locator(".wl-shell-dock").boundingBox();
          if (!actionBox || !dockBox) return Number.POSITIVE_INFINITY;
          return actionBox.y + actionBox.height - dockBox.y;
        },
        { timeout: 5_000, message: "Studio's final action must clear the mobile dock" },
      )
      .toBeLessThanOrEqual(0);
  } catch (error) {
    await testInfo.attach("studio-dock-overlap", {
      body: await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("studio-dock-overlap.png"),
      }),
      contentType: "image/png",
    });
    throw error;
  }
  await page.getByRole("button", { name: "Close Bot settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What should we change?" })).toBeVisible();
  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).not.toHaveValue("");
});

test("More navigation leaves focus on the destination page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto("/settings/billing");
  await page.getByRole("button", { name: "More destinations" }).click();
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await sheet.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Connections", level: 1 })).toBeFocused();
});

test("a signed-in unknown route has one page announcer", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/unknown-design-review-page");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByTestId("route-announcer")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("global overlays clear wrapped workspace and marketing controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockWorkspace(page);
  for (const [path, chrome] of [
    ["/settings/billing", ".wl-shell-dock"],
    ["/pricing", ".marketing-sticky-cta"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("group", { name: "Billing interval" })).toBeVisible();
    await enlargeText(page);
    if (path === "/pricing") await page.locator(".pricing-more__summary").scrollIntoViewIfNeeded();
    await expect(page.locator(chrome)).toBeVisible();
    const chromeBox = (await page.locator(chrome).boundingBox())!;
    await expect
      .poll(() =>
        page
          .getByRole("log", { name: "Notifications" })
          .evaluate((el) => el.getBoundingClientRect().bottom),
      )
      .toBeLessThan(chromeBox.y);
    await page.evaluate(() => window.dispatchEvent(new Event("wireline:open-privacy-choices")));
    const privacy = page.getByRole("region", { name: "Privacy choices" });
    await expect(privacy).toBeVisible();
    await expectContentFits(privacy.locator("*"));
    await expect
      .poll(() => privacy.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThan(chromeBox.y);
    const lastChoice = privacy.getByRole("button", { name: "Allow optional", exact: true });
    await lastChoice.scrollIntoViewIfNeeded();
    const choiceBox = (await lastChoice.boundingBox())!;
    expect(choiceBox.y).toBeGreaterThanOrEqual(0);
    expect(choiceBox.y + choiceBox.height).toBeLessThan(chromeBox.y);
    await page.keyboard.press("Escape");
    await expect(privacy).toBeHidden();
  }
});

test("the phone action wraps a valid unbroken Bot name", async ({ page }) => {
  const name = "B".repeat(100);
  await page.setViewportSize({ width: 320, height: 800 });
  await mockWorkspace(page);
  await page.route("**/api/agents", (route) =>
    route.fulfill({ json: { agents: [{ id: "design-bot", name, role: "receptionist" }] } }),
  );
  await page.route("**/api/phone-numbers", (route) =>
    route.fulfill({
      json: {
        numbers: [{ id: "design-line", phone_number: "+15555550123", agent_id: "design-bot" }],
      },
    }),
  );
  await page.goto("/phone?tab=setup");
  const action = page.getByRole("link", { name: `Open ${name}`, exact: true });
  await expect(action).toBeVisible();
  await enlargeText(page);
  await expectContentFits(action);
});
