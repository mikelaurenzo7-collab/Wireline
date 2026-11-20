import { expect, test, type Page } from "@playwright/test";

const bot = { id: "receipt-bot", name: "Front Desk", role: "receptionist" };
const emptyPlaybook = {
  version: 1,
  exactLines: {},
  situations: [],
  alwaysMention: [],
  neverSay: [],
};

async function mockStudio(page: Page) {
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
                }
              : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
}

async function openSetup(page: Page) {
  await page.goto(`/studio?agent=${bot.id}`);
  await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
}

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
  await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();
  await expect(playbook.getByText(/Playbook saved\./)).toBeVisible();
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
  await playbook.getByRole("button", { name: "Save Playbook", exact: true }).click();
  await expect(playbook.getByText(/Playbook saved\./)).toBeVisible();
  await expect(playbook.getByLabel("Ending the call", { exact: true })).toHaveCount(0);
  await expect(playbook.getByLabel(/Always Mention/)).toHaveValue("");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual({ playbook: emptyPlaybook });
});
