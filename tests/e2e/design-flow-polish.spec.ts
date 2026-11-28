import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function mockWorkspace(page: Page, { emptyRoster = false, failCreates = 0 } = {}) {
  let bots = emptyRoster
    ? []
    : [{ id: "design-bot", name: "Front Desk", role: "receptionist", mark_key: "spark-rose" }];
  let createFailures = failCreates;
  let businessProfile = {
    business_hours: null,
    timezone: "America/Chicago",
    out_of_hours_message: null,
    escalation_phone: "+13125550123",
    transfer_phone: null,
    escalation_email: "team@example.test",
    escalation_handoff_enabled: false,
    escalation_keywords: ["manager"],
  };
  // Isolated UI fixtures: no live account, database, billing, or provider calls.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agents" && route.request().method() === "POST") {
      if (createFailures > 0) {
        createFailures -= 1;
        await route.fulfill({ status: 503, json: { error: "Try again." } });
        return;
      }
      bots = [{ id: "design-bot", name: "Bo", role: "receptionist", mark_key: "spark-rose" }];
      await route.fulfill({
        status: 201,
        json: {
          id: "design-bot",
          name: "Bo",
          mark_key: "spark-rose",
          channel: "voice",
          created: true,
        },
      });
      return;
    }
    if (path.endsWith("/managed-identity")) {
      await route.fulfill({ status: 402, json: { code: "ACTIVATION_REQUIRED" } });
      return;
    }
    if (path === "/api/agent-config/design-bot/business") {
      businessProfile = { ...businessProfile, ...route.request().postDataJSON() };
      await route.fulfill({ json: { success: true, businessProfile } });
      return;
    }
    if (path === "/api/billing/status") {
      await route.fulfill({
        json: {
          channel_entitlements: {
            plan_id: "omnichannel",
            subscription_status: "active",
            channels: ["voice", "email", "sms"],
            is_owner: false,
          },
        },
      });
      return;
    }
    const json =
      path === "/api/auth/session"
        ? { user: { id: "design-owner", email: "owner@example.test" } }
        : path === "/api/agents"
          ? { agents: bots }
          : path === "/api/agent-config/design-bot"
            ? { personality: "Clear", directives: [], mark_key: "spark-rose", businessProfile }
            : { accounts: [], data: [], numbers: [], integrations: [], messages: [], threads: [] };
    await route.fulfill({ json });
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  if (!process.env.BOTBOUND_DESIGN_PROOF_DIR) return;
  await mkdir(process.env.BOTBOUND_DESIGN_PROOF_DIR, { recursive: true });
  const path = join(process.env.BOTBOUND_DESIGN_PROOF_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const width of [320, 390, 1440]) {
  test(`Bo's first conversation stays compact and keeps the owner's words at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await mockWorkspace(page, { emptyRoster: true });
    await page.goto("/studio");
    const log = page.getByRole("log", { name: "Conversation with Bo" });
    await expect(log).toContainText("First, what's your business called?");
    // One Bot, no templates: nothing to choose before answering.
    await expect(page.getByText(/Start from a Role|What should it handle first/)).toHaveCount(0);
    const answer = page.getByRole("textbox", { name: "Your business name" });
    const supplied = "Rivera's Appliance Repair & Same-Day Service of Greater Austin";
    await answer.fill(supplied);
    await expect(answer).toHaveValue(supplied);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `meet-bo-${width}`);
  });
}

test("Studio setup edits survive Review and closing the inspector without saving", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  await page.getByLabel("Opening Greeting").fill("Welcome to the repair desk.");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(page.getByLabel("Opening Greeting")).toHaveValue("Welcome to the repair desk.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to Work", exact: true }).click();
  await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
  await expect(page.getByLabel("Opening Greeting")).toHaveValue("Welcome to the repair desk.");
  await capture(page, info, "studio-draft-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Opening Greeting")).toHaveValue("Welcome to the repair desk.");
  // Knowledge is taught in chat; Set Up has no second typed box.
  await expect(page.getByLabel(/Add facts or rules/)).toHaveCount(0);
  await capture(page, info, "studio-draft-mobile");
});

for (const width of [320, 390, 1440]) {
  test(`public navigation reaches pricing and signup at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthenticated" } }),
    );
    await page.goto("/features");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const pillars = page.getByRole("list", { name: "Available Bot capabilities" });
    await expect(pillars.getByRole("heading", { level: 2 })).toHaveText([
      "Calls",
      "SMS",
      "Email",
      "A Computer",
    ]);
    if (width >= 1024) {
      const geometry = await page.evaluate(() => {
        const title = document.querySelector("h1")!;
        const range = document.createRange();
        range.selectNodeContents(title);
        const center = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        };
        const featureHeading = document.getElementById("features-list-title")!;
        const actions = document.querySelector(".wl-features-intro .marketing-hero__actions")!;
        return {
          lines: [...range.getClientRects()]
            .filter((box) => box.width > 0)
            .map((box) => ({ left: box.left, right: box.right, width: box.width })),
          case: getComputedStyle(title).textTransform,
          titleCenter: center(title),
          featureCenter: center(featureHeading),
          actionCenter: center(actions),
          viewportCenter: innerWidth / 2,
        };
      });
      // One centered column: title, actions, and section heading share an axis.
      expect(geometry.case).toBe("none");
      expect(geometry.lines.length).toBeGreaterThanOrEqual(1);
      for (const line of geometry.lines) {
        expect(line.left).toBeGreaterThanOrEqual(0);
        expect(line.right).toBeLessThanOrEqual(width);
      }
      if (geometry.lines.length > 1) {
        const widths = geometry.lines.map((line) => line.width);
        expect(Math.min(...widths) / Math.max(...widths)).toBeGreaterThan(0.5);
      }
      expect(Math.abs(geometry.titleCenter - geometry.viewportCenter)).toBeLessThan(12);
      expect(Math.abs(geometry.actionCenter - geometry.viewportCenter)).toBeLessThan(12);
      expect(Math.abs(geometry.featureCenter - geometry.viewportCenter)).toBeLessThan(12);
    }
    const header = page.locator("header.wl-public-header");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `features-${width}`);
    await page.goto("/");
    await page.getByRole("link", { name: "See Pricing", exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await header.getByRole("link", { name: "Get Started", exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });
}

test("Studio settings and navigation reflow at 320px with enlarged text", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  await expect(page.getByText(/Couldn't check your email status/)).toBeVisible();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe("32px");
  await expect(page.getByRole("heading", { name: "Bot Setup", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const inspectorOverflows = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '#workspace-main, #studio-inspector, #studio-inspector header, #studio-inspector section, #studio-inspector fieldset, #studio-inspector [role="tablist"], #studio-inspector button, #studio-inspector a, .wl-studio-context-row, .wl-shell-dock, .wl-shell-dock-item > span',
        ),
      ]
        .filter(
          (element) =>
            element.clientWidth > 0 &&
            element.scrollWidth > element.clientWidth + 1 &&
            // Panel tabs scroll in one row on narrow screens by design; a
            // scrollable control is not a layout overflow.
            !["auto", "scroll"].includes(getComputedStyle(element).overflowX),
        )
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          text: element.textContent?.slice(0, 160),
          width: element.clientWidth,
          scroll: element.scrollWidth,
        })),
    );
  expect(await inspectorOverflows()).toEqual([]);
  const handoff = page.getByRole("button", { name: /Human Handoff/ });
  await handoff.click();
  await expect(page.getByLabel("Notification email", { exact: true })).toHaveValue(
    "team@example.test",
  );
  await expect(handoff).toContainText("Notify & review");
  expect(await inspectorOverflows()).toEqual([]);
  await page.getByRole("switch", { name: "Transfer live calls", exact: true }).click();
  await page.getByLabel(/Escalate when callers mention/).fill("manager\nurgent complaint");
  await page.getByRole("button", { name: "Save Handoff", exact: true }).click();
  await expect(
    page.getByText("Live transfers are on. Test your connected phone before sharing it.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await inspectorOverflows()).toEqual([]);
  expect(
    await page.locator("#human-handoff-settings").evaluate((element) =>
      [element, ...element.querySelectorAll("form, label, p, div, fieldset, button")]
        .filter((item) => item.clientWidth > 0 && item.scrollWidth > item.clientWidth + 1)
        .map((item) => ({
          tag: item.tagName,
          width: item.clientWidth,
          scroll: item.scrollWidth,
        })),
    ),
  ).toEqual([]);
  await handoff.click();
  await expect(handoff).toContainText("Live transfer");
  expect(await inspectorOverflows()).toEqual([]);
  await page.getByRole("button", { name: "Energetic", exact: true }).click();
  await expect(page.getByRole("button", { name: "Energetic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Opening Greeting").fill("Welcome to the repair desk.");
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(page.getByLabel("Opening Greeting")).toHaveValue("Welcome to the repair desk.");
  await capture(page, info, "studio-320-enlarged-text");
  await page.getByRole("button", { name: "Back to Work", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set Up Bot", exact: true })).toBeFocused();
  const workroom = page.getByRole("region", { name: "Front Desk workroom", exact: true });
  await expect(workroom).toBeVisible();
  expect(
    await workroom.evaluate((element) =>
      [element, ...element.querySelectorAll("header, header > div, header p, header h2")]
        .filter((item) => item.scrollWidth > item.clientWidth + 1)
        .map((item) => ({
          tag: item.tagName,
          class: item.className,
          width: item.clientWidth,
          scroll: item.scrollWidth,
        })),
    ),
  ).toEqual([]);
  await workroom
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Use a warmer greeting.");
  await workroom.getByRole("button", { name: "Send", exact: true }).click({ trial: true });
});

test("Bo's first conversation stays usable at 320px with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockWorkspace(page, { emptyRoster: true });
  await page.goto("/studio");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  const log = page.getByRole("log", { name: "Conversation with Bo" });
  await expect(log).toContainText("what's your business called?");
  await page.evaluate(() => document.fonts.ready);
  const answer = page.getByRole("textbox", { name: "Your business name" });
  await answer.fill("Rivera's Appliance Repair");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
  expect(
    await page.locator("[data-bo-onboarding]").evaluate((element) =>
      [element, ...element.querySelectorAll("div, h1, button, input, textarea, label, p")]
        .filter(
          (item) =>
            item.clientWidth > 0 &&
            item.scrollWidth > item.clientWidth + 1 &&
            getComputedStyle(item).overflowX === "visible",
        )
        .map((item) => ({
          tag: item.tagName,
          width: item.clientWidth,
          scroll: item.scrollWidth,
        })),
    ),
  ).toEqual([]);
});

test("Bo says plainly when it could not be set up and tries again on request", async ({ page }) => {
  await mockWorkspace(page, { emptyRoster: true, failCreates: 1 });
  await page.goto("/studio");
  await expect(page.getByText("Bo Isn't Ready Yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your business name" })).toBeDisabled();
  await page.getByRole("button", { name: "Try Again", exact: true }).click();
  await expect(page.getByText("Bo Isn't Ready Yet", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your business name" })).toBeEnabled();
});

test("password reset names and focuses the invalid field and permits reviewing both entries", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/reset-password") submissions += 1;
    await route.fulfill({ status: 401, json: { error: "Unauthenticated" } });
  });
  await page.goto("/reset-password#token=local-ui-test-only");
  // getByLabel includes the visual required marker; the accessible name omits it.
  const password = page.getByLabel(/^New password/);
  const confirm = page.getByLabel(/^Confirm new password/);
  await expect(password).toHaveAccessibleName("New password");
  await expect(confirm).toHaveAccessibleName("Confirm new password");
  await password.fill("onlylowercase");
  await confirm.fill("onlylowercase");
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAccessibleDescription(/uppercase/i);
  await password.fill("LocalTest123");
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAccessibleDescription("Passwords don't match.");
  await page.getByRole("button", { name: "Show passwords" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirm).toHaveAttribute("type", "text");
  expect(submissions).toBe(0);
  await expect(page).toHaveURL(/\/reset-password$/);
});
