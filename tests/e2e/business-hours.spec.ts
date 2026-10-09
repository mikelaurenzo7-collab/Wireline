import { expect, test, type Locator, type Page } from "@playwright/test";

const bot = { id: "hours-bot", name: "Front Desk", role: "receptionist", mark_key: "spark-rose" };

async function mockStudio(page: Page) {
  const saves: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/agent-config/${bot.id}/business`) {
      const body = request.postDataJSON();
      saves.push(body);
      await route.fulfill({ json: { success: true, businessProfile: body } });
      return;
    }
    // Every endpoint stays mocked: no account, database, or provider traffic runs.
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "hours-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: [bot] }
            : path === `/api/agent-config/${bot.id}`
              ? {
                  personality: "Clear",
                  directives: [],
                  mark_key: bot.mark_key,
                  businessProfile: {
                    business_hours: null,
                    timezone: "UTC",
                    out_of_hours_message: null,
                  },
                }
              : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
  return saves;
}

async function openHours(page: Page) {
  await page.goto(`/studio?agent=${bot.id}`);
  await page.getByRole("button", { name: "Bot settings" }).click();
  const hours = page.getByRole("region", { name: "Business Hours", exact: true });
  await expect(hours.getByText("Always open", { exact: true })).toBeVisible();
  await hours.getByRole("switch", { name: "Set business hours" }).click();
  return hours;
}

async function expectContentFits(container: Locator) {
  await expect
    .poll(() =>
      container.locator("*").evaluateAll((elements) =>
        elements
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              element.clientWidth > 1 &&
              element.getBoundingClientRect().height > 1 &&
              style.overflowX !== "auto" &&
              style.overflowX !== "scroll"
            );
          })
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 70)}`),
      ),
    )
    .toEqual([]);
}

test("an owner sets business hours and an after-hours greeting in Studio", async ({ page }) => {
  const saves = await mockStudio(page);
  const hours = await openHours(page);

  await expect(hours.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  await expect(hours.getByLabel("Monday opens")).toHaveValue("09:00");
  await expect(hours.getByLabel("Monday closes")).toHaveValue("17:00");
  await expect(hours.getByRole("checkbox", { name: "Saturday" })).not.toBeChecked();

  await hours.getByLabel("Time zone").selectOption("America/Chicago");
  await hours.getByLabel("Friday closes").fill("15:00");
  await hours.getByRole("checkbox", { name: "Saturday" }).check();
  await hours.getByLabel("Saturday opens").fill("10:00");
  await hours.getByLabel("Saturday closes").fill("14:00");
  await hours
    .getByRole("textbox", { name: /After-hours greeting/ })
    .fill("Thanks for calling Front Desk. We're closed, but I can take a message.");
  await hours.getByRole("button", { name: "Save hours" }).click();

  await expect(hours.getByText("Hours Saved", { exact: true })).toBeVisible();
  expect(saves).toEqual([
    {
      business_hours: {
        mon: { open: "09:00", close: "17:00" },
        tue: { open: "09:00", close: "17:00" },
        wed: { open: "09:00", close: "17:00" },
        thu: { open: "09:00", close: "17:00" },
        fri: { open: "09:00", close: "15:00" },
        sat: { open: "10:00", close: "14:00" },
        sun: { closed: true },
      },
      timezone: "America/Chicago",
      out_of_hours_message:
        "Thanks for calling Front Desk. We're closed, but I can take a message.",
    },
  ]);
  await expect(hours.getByText(/^(Open now|After hours)$/)).toBeVisible();
  await expect(hours.getByText(/ in Chicago\./)).toBeVisible();
});

test("a day that never opens is explained instead of saved", async ({ page }) => {
  const saves = await mockStudio(page);
  const hours = await openHours(page);

  await hours.getByLabel("Tuesday closes").fill("09:00");
  await hours.getByRole("button", { name: "Save hours" }).click();

  await expect(hours.getByText(/Tuesday opens and closes at the same time/)).toBeVisible();
  expect(saves).toEqual([]);
});

test("the hours editor fits a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockStudio(page);
  const hours = await openHours(page);
  await expect(hours.getByLabel("Sunday opens")).toHaveCount(0);
  await expectContentFits(hours);
});
