import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function mockWorkspace(page: Page) {
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
          ? {
              agents: [
                {
                  id: "design-bot",
                  name: "Front Desk",
                  role: "receptionist",
                  mark_key: "spark-rose",
                },
              ],
            }
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
  test(`Bot creation stays compact and preserves custom intent at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await mockWorkspace(page);
    await page.goto("/studio?create=1");
    const dialog = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
    await expect(dialog.getByRole("heading", { name: "What Should Your Bot Do?" })).toBeFocused();
    await dialog.getByText("Start from a Role", { exact: true }).click();
    const role = dialog.getByRole("combobox", { name: "Bot role starters" });
    const brief = dialog.getByRole("textbox", { name: "Describe the Job" });
    await role.selectOption("front-desk");
    await expect(brief).not.toHaveValue("");
    const supplied = "Book repairs only after checking the customer's ZIP code.";
    await brief.fill(supplied);
    await role.selectOption("appointment-setter");
    await expect(brief).toHaveValue(supplied);
    await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create Bot", exact: true })).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `create-${width}`);
    const identity = dialog.getByRole("button", { name: /Appearance/ });
    await identity.click();
    await dialog.getByRole("textbox", { name: /Bot Name/ }).fill("Repair Desk");
    await identity.click();
    await expect(identity).toContainText("Repair Desk");
    await expect(brief).toHaveValue(supplied);
    await identity.press("Escape");
    await expect(dialog).toBeHidden();
  });
}

test("Studio setup edits survive Review and closing the inspector without saving", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  await page.getByLabel("Opening greeting").fill("Welcome to the repair desk.");
  await page.getByLabel(/Add facts or rules/).fill("Ask for the appliance model before booking.");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByLabel("Opening greeting")).toHaveValue("Welcome to the repair desk.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Bot details", exact: true }).click();
  await expect(page.getByLabel("Opening greeting")).toHaveValue("Welcome to the repair desk.");
  await capture(page, info, "studio-draft-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel(/Add facts or rules/)).toHaveValue(
    "Ask for the appliance model before booking.",
  );
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
      "Ready When the Phone Rings",
      "Works From a Goal",
      "Follows Up in Writing",
    ]);
    const features = page.getByRole("list", { name: "Built Around You" });
    await expect(features.getByRole("heading", { level: 3 })).toHaveText([
      "Reviewed Calls",
      "Made Yours",
      "Native Calendar Booking",
      "Approvals and Handoffs",
      "One Workspace",
      "Clear Outcomes",
      "Rehearse Before Launch",
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
          lines: range.getClientRects().length,
          titleCenter: center(title),
          featureCenter: center(featureHeading),
          actionCenter: center(actions),
          viewportCenter: innerWidth / 2,
        };
      });
      // One centered column: title, actions, and section heading share an axis.
      expect(geometry.lines).toBe(1);
      expect(Math.abs(geometry.titleCenter - geometry.viewportCenter)).toBeLessThan(12);
      expect(Math.abs(geometry.actionCenter - geometry.viewportCenter)).toBeLessThan(12);
      expect(Math.abs(geometry.featureCenter - geometry.viewportCenter)).toBeLessThan(12);
    }
    const header = page.locator("header.wl-public-header");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `features-${width}`);
    if (width < 768) {
      await header.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("menuitem", { name: "Pricing", exact: true }).click();
    } else await header.getByRole("link", { name: "Pricing", exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await header.getByRole("link", { name: "Get Started", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?plan=free/);
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
  await expect(page.getByRole("heading", { name: "Tone & Knowledge" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const inspectorOverflows = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '#workspace-main, #studio-inspector, #studio-inspector header, #studio-inspector section, #studio-inspector fieldset, #studio-inspector [role="tablist"], #studio-inspector button, #studio-inspector a, .wl-studio-context-row, .wl-shell-dock, .wl-shell-dock-item > span',
        ),
      ]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
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
  await page.getByLabel("Opening greeting").fill("Welcome to the repair desk.");
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByLabel("Opening greeting")).toHaveValue("Welcome to the repair desk.");
  await capture(page, info, "studio-320-enlarged-text");
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bot details", exact: true })).toBeFocused();
  const workroom = page.getByRole("region", { name: "Front Desk workroom", exact: true });
  await expect(workroom).toBeVisible();
  expect(
    await workroom.evaluate((element) =>
      [element, ...element.querySelectorAll("header, header > div, header p, header h2")]
        .filter((item) => item.scrollWidth > item.clientWidth + 1)
        .map((item) => ({ tag: item.tagName, width: item.clientWidth, scroll: item.scrollWidth })),
    ),
  ).toEqual([]);
  await workroom
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Use a warmer greeting.");
  await workroom.getByRole("button", { name: "Send", exact: true }).click({ trial: true });
});

test("Bot creation keeps its heading, fields and actions usable at 320px with enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockWorkspace(page);
  await page.goto("/studio?create=1");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  const dialog = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(dialog.getByRole("heading", { name: "What Should Your Bot Do?" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Create Bot", exact: true })).toBeInViewport();
  const brief = dialog.getByRole("textbox", { name: "Describe the Job" });
  await brief.fill("Answer repair questions and book a visit.");
  const identity = dialog.getByRole("button", { name: /Appearance/ });
  await identity.click();
  await dialog.getByRole("textbox", { name: /Bot Name/ }).fill("Repair Desk");
  await identity.click();
  await expect(brief).toHaveValue("Answer repair questions and book a visit.");
  expect(
    await dialog.evaluate((element) =>
      [element, ...element.querySelectorAll("div, h2, button, textarea, label")]
        .filter(
          (item) =>
            item.clientWidth > 0 &&
            item.scrollWidth > item.clientWidth + 1 &&
            getComputedStyle(item).overflowX === "visible",
        )
        .map((item) => ({ tag: item.tagName, width: item.clientWidth, scroll: item.scrollWidth })),
    ),
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Close Bot setup", exact: true }).click();
  await expect(dialog).toBeHidden();
});

for (const code of ["NAME_CONFLICT", "name_conflict", "BOT_MARK_CONFLICT", "bot_mark_conflict"]) {
  test(`creation conflict ${code} reveals and focuses the relevant control`, async ({ page }) => {
    await mockWorkspace(page);
    await page.route("**/api/agents", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 409, json: { code } });
      } else await route.fallback();
    });
    await page.goto("/studio?create=1");
    const dialog = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
    const brief = dialog.getByRole("textbox", { name: "Describe the Job" });
    await brief.fill("Book repair appointments.");
    await dialog.getByRole("button", { name: "Create Bot", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /Appearance/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    if (code.toLowerCase() === "bot_mark_conflict") {
      await expect(
        dialog
          .getByRole("radiogroup", { name: "Bot identity symbol" })
          .getByRole("radio", { checked: true }),
      ).toBeFocused();
      await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).not.toBeFocused();
      await expect(dialog.getByText(/Choose another mark or color/)).toBeVisible();
    } else await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).toBeFocused();
    await expect(brief).toHaveValue("Book repair appointments.");
  });
}

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
