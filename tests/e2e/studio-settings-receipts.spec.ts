import { expect, test, type Page } from "@playwright/test";

const bot = { id: "receipt-bot", name: "Front Desk", role: "receptionist" };
const emptyPlaybook = {
  version: 1,
  exactLines: {},
  situations: [],
  alwaysMention: [],
  neverSay: [],
  checkFirst: [],
};

async function mockStudio(page: Page, config: Record<string, unknown> = {}) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    // All account and provider endpoints are fixtures.
    return route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "receipt-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: [bot] }
            : path === `/api/agent-config/${bot.id}`
              ? {
                  personality: "Clear",
                  directives: [],
                  playbook: emptyPlaybook,
                  businessProfile: {
                    business_hours: null,
                    timezone: "UTC",
                    out_of_hours_message: null,
                  },
                  ...config,
                }
              : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
}

async function openSetup(page: Page) {
  await page.goto(`/studio?agent=${bot.id}`);
  await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
}

test("Human Handoff preserves routing after a different destination and confirms retry and clear", async ({
  page,
}, testInfo) => {
  await mockStudio(page, {
    businessProfile: {
      business_hours: null,
      timezone: "America/Chicago",
      out_of_hours_message: null,
      escalation_phone: null,
      transfer_phone: null,
      escalation_email: "team@example.test",
      escalation_handoff_enabled: false,
      escalation_keywords: [],
    },
  });
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/api/agent-config/${bot.id}/business`, (route) => {
    const submitted = route.request().postDataJSON();
    writes.push(submitted);
    return route.fulfill({
      json: {
        success: true,
        businessProfile: {
          ...submitted,
          transfer_phone: null,
          escalation_phone: writes.length === 1 ? "+13125550125" : submitted.escalation_phone,
        },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSetup(page);
  const handoff = page.getByRole("button", { name: /^Human Handoff/ });
  await handoff.click();
  const settings = page.locator("#human-handoff-settings");
  const phone = settings.getByLabel("Phone number", { exact: true });
  const email = settings.getByLabel("Notification email", { exact: true });
  await phone.fill("(312) 555-0123");
  await settings.getByRole("switch", { name: "Transfer live calls", exact: true }).check();
  await settings.getByLabel(/Escalate when callers mention/).fill("manager, urgent\nmanager");
  await settings.getByRole("button", { name: "Save Handoff", exact: true }).click();
  await expect(settings.getByText(/save could not be confirmed/)).toBeVisible();
  await expect(settings.getByText(/Live transfers are on/)).toHaveCount(0);
  await expect(handoff).toContainText("Notify & review");
  await expect(phone).toHaveValue("(312) 555-0123");
  await settings.screenshot({ path: testInfo.outputPath("handoff-unconfirmed-mobile.png") });
  await settings.getByRole("button", { name: "Save Handoff", exact: true }).click();
  await expect(settings.getByText(/Live transfers are on/)).toBeVisible();
  await expect(phone).toHaveValue("+13125550123");
  await expect(settings.getByLabel(/Escalate when callers mention/)).toHaveValue("manager\nurgent");
  expect(writes[1]).toEqual(writes[0]);
  await phone.fill("");
  await email.fill("");
  await settings.getByRole("switch", { name: "Transfer live calls", exact: true }).uncheck();
  await settings.getByLabel(/Escalate when callers mention/).fill("");
  await settings.getByRole("button", { name: "Save Handoff", exact: true }).click();
  await expect(settings.getByText("Human handoff settings saved.", { exact: true })).toBeVisible();
  await settings.screenshot({ path: testInfo.outputPath("handoff-confirmed-clear-mobile.png") });
  expect(writes[2]).toEqual({
    escalation_phone: null,
    escalation_email: null,
    escalation_handoff_enabled: false,
    escalation_keywords: [],
  });
});

test("Permission rejects another Bot's receipt and confirms a safe retry", async ({ page }) => {
  // The server answers in today's names (`autonomy`) and, for a tab opened
  // before them, in the old ones (`permission`). The screen reads only the first.
  await mockStudio(page, { autonomy: "messages", permission: "auto" });
  const writes: unknown[] = [];
  await page.route(`**/api/agents/${bot.id}/permission`, (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      json: { id: writes.length === 1 ? "another-bot" : bot.id, autonomy: "ask" },
    });
  });
  await openSetup(page);
  const permission = page.getByLabel("How Your Bot Works", { exact: true });
  await expect(permission).toHaveValue("messages");
  await expect(permission.locator("option")).toHaveText([
    "Auto: it decides when to check with me",
    "On its own, always",
    "Check with me before it emails or texts a customer",
    "Check with me before it does anything",
  ]);
  await permission.selectOption("ask");
  await expect(page.getByText(/That change could not be confirmed\./)).toBeVisible();
  await expect(permission).toHaveValue("messages");
  expect(writes).toEqual([{ autonomy: "ask" }]);
  await permission.selectOption("ask");
  await expect(permission).toHaveValue("ask");
  await expect(page.getByText(/That change could not be confirmed\./)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Calendar settings", exact: true })).toHaveAttribute(
    "href",
    "/calendar?tab=availability",
  );
  expect(writes).toEqual([{ autonomy: "ask" }, { autonomy: "ask" }]);
});

test("Actions keeps the owner's selection until the saved tools are confirmed", async ({
  page,
}) => {
  await mockStudio(page, { enabledTools: [] });
  const writes: Array<{ enabled_tools: string[] }> = [];
  await page.route(`**/api/agents/${bot.id}/tools`, (route) => {
    const submitted = route.request().postDataJSON();
    writes.push(submitted);
    return route.fulfill({
      json:
        writes.length === 1
          ? { success: true }
          : { success: true, enabledTools: submitted.enabled_tools },
    });
  });
  await openSetup(page);
  const actions = page.getByRole("region", { name: "Actions", exact: true });
  await actions.getByRole("button", { name: "Actions", exact: true }).click();
  await actions.locator("summary", { hasText: "Platform Actions" }).click();
  // An action the owner can switch. Knowledge search no longer has a
  // checkbox: every Bot has it.
  await expect(actions.getByRole("checkbox", { name: /^Search knowledge base/ })).toHaveCount(0);
  await expect(actions.getByText("Always on", { exact: true })).toHaveCount(3);
  const knowledge = actions.getByRole("checkbox", { name: /^Create support ticket/ });
  await expect(knowledge).not.toBeChecked();
  await knowledge.check();
  await actions.getByRole("button", { name: "Save Actions", exact: true }).click();
  await expect(actions.getByText(/Actions could not be confirmed\./)).toBeVisible();
  await expect(actions.getByText(/Try the updated actions/)).toHaveCount(0);
  await expect(knowledge).toBeChecked();
  expect(writes).toEqual([{ enabled_tools: ["create_support_ticket"] }]);
  await actions.getByRole("button", { name: "Save Actions", exact: true }).click();
  await expect(actions.getByText(/Try the updated actions/)).toBeVisible();
  await expect(actions.getByText(/Actions could not be confirmed\./)).toHaveCount(0);
  await expect(knowledge).toBeChecked();
  expect(writes).toEqual([
    { enabled_tools: ["create_support_ticket"] },
    { enabled_tools: ["create_support_ticket"] },
  ]);
});

for (const kind of ["missing", "malformed", "different"] as const) {
  test(`Hours preserves the draft after a ${kind} save confirmation`, async ({ page }) => {
    await mockStudio(page);
    const writes: Array<Record<string, unknown>> = [];
    await page.route(`**/api/agent-config/${bot.id}/business`, (route) => {
      const submitted = route.request().postDataJSON();
      writes.push(submitted);
      const confirmed = {
        ...submitted,
        business_hours: Object.fromEntries(Object.entries(submitted.business_hours).reverse()),
      };
      return route.fulfill({
        json:
          writes.length > 1
            ? { success: true, businessProfile: confirmed }
            : kind === "missing"
              ? { success: true }
              : {
                  success: true,
                  businessProfile: {
                    ...submitted,
                    business_hours: kind === "malformed" ? "unconfirmed" : null,
                  },
                },
      });
    });
    await openSetup(page);
    const hours = page.getByRole("region", { name: "Business Hours", exact: true });
    await expect(hours.getByText("Always open", { exact: true })).toBeVisible();
    await hours.getByRole("switch", { name: "Set business hours" }).click();
    await hours.getByLabel("Time zone").selectOption("America/Chicago");
    await hours.getByLabel("Friday closes").fill("15:00");
    await hours
      .getByRole("textbox", { name: /After-hours greeting/ })
      .fill("Please leave a message.");
    await hours.getByRole("button", { name: "Save Hours", exact: true }).click();

    await expect(hours.getByText(/save could not be confirmed/i)).toBeVisible();
    await expect(hours.getByText("Hours Saved", { exact: true })).toHaveCount(0);
    await expect(hours.getByLabel("Friday closes")).toHaveValue("15:00");
    await expect(hours.getByRole("textbox", { name: /After-hours greeting/ })).toHaveValue(
      "Please leave a message.",
    );
    await expect(hours.getByText("Always open", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    await hours.getByRole("button", { name: "Save Hours", exact: true }).click();
    await expect(hours.getByText("Hours Saved", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });

  test(`Playbook preserves the draft after a ${kind} save confirmation`, async ({ page }) => {
    await mockStudio(page);
    const writes: Array<Record<string, unknown>> = [];
    await page.route(`**/api/agent-config/${bot.id}/playbook`, (route) => {
      const submitted = route.request().postDataJSON();
      writes.push(submitted);
      return route.fulfill({
        json:
          writes.length > 1
            ? { success: true, playbook: submitted.playbook }
            : kind === "missing"
              ? { success: true }
              : {
                  success: true,
                  playbook:
                    kind === "malformed"
                      ? { ...emptyPlaybook, alwaysMention: "unconfirmed" }
                      : emptyPlaybook,
                },
      });
    });
    await openSetup(page);
    await page.getByRole("button", { name: /^Playbook/ }).click();
    const playbook = page.locator("#bot-playbook");
    await playbook.getByRole("button", { name: "Ending the call", exact: true }).click();
    await playbook.getByLabel("Ending the call", { exact: true }).fill("Thank you for calling.");
    await playbook.getByLabel(/Always Mention/).fill("Estimates are free.");
    await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();

    await expect(playbook.getByText(/save could not be confirmed/i)).toBeVisible();
    await expect(playbook.getByText(/Playbook saved\./)).toHaveCount(0);
    await expect(playbook.getByLabel("Ending the call", { exact: true })).toHaveValue(
      "Thank you for calling.",
    );
    await expect(playbook.getByLabel(/Always Mention/)).toHaveValue("Estimates are free.");
    expect(writes).toHaveLength(1);
    await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();
    await expect(playbook.getByText(/Playbook saved\./)).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
}

test("Hours accepts a confirmed cleared schedule", async ({ page }) => {
  await mockStudio(page);
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/api/agent-config/${bot.id}/business`, (route) => {
    const submitted = route.request().postDataJSON();
    writes.push(submitted);
    return route.fulfill({ json: { success: true, businessProfile: submitted } });
  });
  await openSetup(page);
  const hours = page.getByRole("region", { name: "Business Hours", exact: true });
  const enabled = hours.getByRole("switch", { name: "Set business hours" });
  await expect(hours.getByText("Always open", { exact: true })).toBeVisible();
  await enabled.click();
  await hours.getByRole("button", { name: "Save Hours", exact: true }).click();
  await expect(hours.getByText("Hours Saved", { exact: true })).toBeVisible();
  await enabled.click();
  await hours.getByRole("button", { name: "Save Hours", exact: true }).click();
  await expect(hours.getByText("Hours Saved", { exact: true })).toBeVisible();
  await expect(hours.getByText("Always open", { exact: true })).toBeVisible();
  await expect(enabled).not.toBeChecked();
  expect(writes).toHaveLength(2);
  expect(writes[1]!.business_hours).toBeNull();
});

test("Playbook accepts normalized wording, reordered lines and a confirmed clear", async ({
  page,
}) => {
  await mockStudio(page);
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/api/agent-config/${bot.id}/playbook`, (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        success: true,
        playbook:
          writes.length === 1
            ? {
                ...emptyPlaybook,
                exactLines: { hold: "One moment.", closing: "Thank you for calling." },
                alwaysMention: ["Estimates are free."],
                checkFirst: ["A customer asks for a refund"],
              }
            : emptyPlaybook,
      },
    });
  });
  await openSetup(page);
  await page.getByRole("button", { name: /^Playbook/ }).click();
  const playbook = page.locator("#bot-playbook");
  await playbook.getByRole("button", { name: "Ending the call", exact: true }).click();
  await playbook.getByLabel("Ending the call", { exact: true }).fill(" Thank you for  calling. ");
  await playbook.getByRole("button", { name: "Checking something", exact: true }).click();
  await playbook.getByLabel("Checking something", { exact: true }).fill(" One moment. ");
  await playbook.getByLabel(/Always Mention/).fill("Estimates are free.\nEstimates are free.");
  // The owner's own rules for when the Bot should check first.
  await playbook
    .getByLabel(/Check With Me First When/)
    .fill(" A customer asks for a refund \nA customer asks for a refund");
  await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();
  await expect(playbook.getByText(/Playbook saved\./)).toBeVisible();
  await expect(playbook.getByLabel(/Check With Me First When/)).toHaveValue(
    "A customer asks for a refund",
  );
  await expect(playbook.getByLabel("Ending the call", { exact: true })).toHaveValue(
    "Thank you for calling.",
  );
  await expect(playbook.getByLabel(/Always Mention/)).toHaveValue("Estimates are free.");
  await playbook
    .getByRole("button", { name: "Remove the ending the call line", exact: true })
    .click();
  await playbook
    .getByRole("button", { name: "Remove the checking something line", exact: true })
    .click();
  await playbook.getByLabel(/Always Mention/).fill("");
  await playbook.getByLabel(/Check With Me First When/).fill("");
  await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();
  await expect(playbook.getByText(/Playbook saved\./)).toBeVisible();
  await expect(playbook.getByLabel("Ending the call", { exact: true })).toHaveCount(0);
  await expect(playbook.getByLabel(/Always Mention/)).toHaveValue("");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual({ playbook: emptyPlaybook });
});
