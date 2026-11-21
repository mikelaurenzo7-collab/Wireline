import { expect, test, type Page } from "@playwright/test";

const initial = () => ({
  enabled: false,
  time_zone: "America/Chicago",
  appointment_name: "Consultation",
  duration_minutes: 30,
  buffer_minutes: 0,
  minimum_notice_minutes: 60,
  booking_mode: "automatic",
  weekly_hours: [{ day: 1, start: "09:00", end: "17:00" }],
});

async function mockCalendar(page: Page) {
  let settings = initial();
  let configured = false;
  let failSave = true;
  const writes: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/calendar/settings") {
      if (route.request().method() === "PUT") {
        writes.push(route.request().postDataJSON());
        if (failSave) {
          failSave = false;
          await route.fulfill({
            status: 503,
            json: { error: "Calendar temporarily unavailable. Try again." },
          });
          return;
        }
        settings = route.request().postDataJSON();
        configured = true;
      }
      await route.fulfill({ json: { settings, configured } });
      return;
    }
    const json =
      path === "/api/auth/session"
        ? {
            user: {
              id: "calendar-owner",
              email: "owner@example.test",
              full_name: "Calendar Owner",
              email_verified_at: "2026-09-27T00:00:00Z",
            },
          }
        : path === "/api/agents"
          ? { agents: [] }
          : path === "/api/appointments"
            ? { appointments: [], hasMore: false, nextCursor: null }
            : path === "/api/billing/status"
              ? {
                  subscription: null,
                  agent_count: 0,
                  channel_entitlements: {
                    plan_id: "personal",
                    subscription_status: "none",
                    channels: [],
                    is_owner: false,
                  },
                }
              : { accounts: [], data: [], numbers: [], integrations: [] };
    await route.fulfill({ json });
  });
  return writes;
}

for (const receipt of [
  { name: "partial", body: { google: { status: "partial" } } },
  { name: "failed", body: { google: { status: "error" } } },
  { name: "disconnected", body: { google: { status: "no_accounts" } } },
  { name: "missing", body: { outlook: { status: "success" } } },
  { name: "malformed", body: null },
  { name: "HTTP failure", body: { google: { status: "success" } }, status: 503 },
]) {
  test(`Google calendar does not claim success for a ${receipt.name} sync and can retry`, async ({
    page,
  }) => {
    await mockCalendar(page);
    await page.route("**/api/calendar/accounts", (route) =>
      route.fulfill({ json: { accounts: [{ provider: "google" }] } }),
    );
    let retry = false;
    await page.route("**/api/calendar/sync", (route) =>
      route.fulfill({
        status: retry ? 200 : receipt.status || 200,
        json: retry ? { google: { status: "success", syncedCount: 0 } } : receipt.body,
      }),
    );
    await page.goto("/calendar");
    await expect(page.getByText("Google Calendar connected", { exact: true })).toBeVisible();
    await expect(page.getByText("2-way sync", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Refresh busy times after calendar changes. BotBound bookings stay here."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Refresh busy times", exact: true }).click();
    await expect(page.getByText(/Google busy times could not be fully refreshed/)).toBeVisible();
    await expect(page.getByText(/Google busy times refreshed at/)).toHaveCount(0);
    retry = true;
    await page.getByRole("button", { name: "Refresh busy times", exact: true }).click();
    await expect(page.getByText(/Google busy times refreshed at/)).toBeVisible();
    await expect(page.getByText(/Google busy times could not be fully refreshed/)).toHaveCount(0);
  });
}

test("Calendar connection failure offers retry instead of claiming Google is disconnected", async ({
  page,
}) => {
  await mockCalendar(page);
  let retry = false;
  await page.route("**/api/calendar/accounts", (route) =>
    retry
      ? route.fulfill({ json: { accounts: [{ provider: "google" }] } })
      : route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/calendar");
  await expect(page.getByText("Couldn’t check connected calendars", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Google Calendar", exact: true }),
  ).toHaveCount(0);
  retry = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Google Calendar connected", { exact: true })).toBeVisible();
});

test("native bookings do not imply that a Google Calendar event exists", async ({ page }) => {
  await mockCalendar(page);
  await page.route(/\/api\/appointments(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        appointments: [
          {
            id: "native-booking",
            customer_name: "Native booking",
            booking_source: "native",
            status: "Confirmed",
            start_at: "2099-12-01T10:00:00Z",
            end_at: "2099-12-01T10:30:00Z",
            time_zone: "UTC",
          },
        ],
        hasMore: false,
        nextCursor: null,
      },
    }),
  );
  await page.goto("/calendar");
  const booking = page.getByRole("listitem").filter({ hasText: "Native booking" });
  await expect(booking).toBeVisible();
  await expect(booking.getByRole("link", { name: /Google Calendar/ })).toHaveCount(0);
});

for (const width of [320, 1440]) {
  test(`Calendar availability preserves failed drafts and fits ${width}px${width === 320 ? " at 200% text" : ""}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockCalendar(page);
    await page.goto("/calendar?tab=availability");
    await expect(page.getByRole("heading", { name: "Weekly Hours" })).toBeVisible();
    if (width === 320)
      await page.evaluate(async () => {
        document.documentElement.style.fontSize = "200%";
        await document.fonts.ready;
      });
    await page.getByRole("checkbox", { name: "Monday", exact: true }).uncheck();
    await expect(page.getByRole("checkbox", { name: "Monday", exact: true })).not.toBeChecked();
    await expect(page.getByLabel("Monday start", { exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Tuesday", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Tuesday", exact: true })).toBeChecked();
    await expect(page.getByLabel("Tuesday start", { exact: true })).toHaveValue("09:00");
    await page.getByRole("textbox", { name: "Appointment name", exact: true }).fill("Repair visit");
    await page
      .getByRole("combobox", { name: "Confirmation", exact: true })
      .selectOption("approval");
    await page.getByRole("button", { name: "Enable Booking", exact: true }).click();
    await expect(
      page.getByText("Calendar temporarily unavailable. Try again.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Appointment name", exact: true })).toHaveValue(
      "Repair visit",
    );
    await expect(page.getByRole("combobox", { name: "Confirmation", exact: true })).toHaveValue(
      "approval",
    );
    await page.getByRole("button", { name: "Enable Booking", exact: true }).click();
    await expect(page.getByText("Availability saved.", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({
      enabled: true,
      booking_mode: "approval",
      appointment_name: "Repair visit",
      weekly_hours: [{ day: 2, start: "09:00", end: "17:00" }],
    });
    await expect
      .poll(() =>
        page
          .locator('[data-visual-qa-page="calendar"] form, [data-visual-qa-page="calendar"] form *')
          .evaluateAll((elements) =>
            elements
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  element.clientWidth > 1 &&
                  !["auto", "scroll"].includes(style.overflowX) &&
                  element.scrollWidth > element.clientWidth + 2
                );
              })
              .map((element) => ({
                tag: element.tagName,
                id: element.id,
                width: element.clientWidth,
                scroll: element.scrollWidth,
                text: element.textContent?.trim().slice(0, 50),
              })),
          ),
      )
      .toEqual([]);
    const save = page.getByRole("button", { name: "Save Changes", exact: true });
    await save.scrollIntoViewIfNeeded();
    if (width === 320) {
      const action = (await save.boundingBox())!;
      const dock = (await page.locator(".wl-shell-dock").boundingBox())!;
      expect(action.y + action.height).toBeLessThanOrEqual(dock.y);
    }
    const accepting = page.getByRole("switch", { name: "Accept Bookings", exact: true });
    await accepting.uncheck();
    await expect(accepting).not.toBeChecked();
    await save.click();
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2]).toMatchObject({
      enabled: false,
      weekly_hours: [{ day: 2, start: "09:00", end: "17:00" }],
    });
    await expect(page.getByText("Availability saved.", { exact: true })).toBeVisible();
    await accepting.check();
    await expect(accepting).toBeChecked();
    await save.click();
    await expect.poll(() => writes.length).toBe(4);
    expect(writes[3]).toMatchObject({ enabled: true });
    await expect(page.getByText("Availability saved.", { exact: true })).toBeVisible();
    await page.getByText("Connected calendars", { exact: false }).click();
    await expect(page.getByRole("button", { name: "Sync Busy Times", exact: true })).toBeVisible();
    await expect(page.getByText(/New BotBound bookings stay here/)).toBeVisible();
  });
}

test("legacy appointment links land on native Calendar with their scope and anchor", async ({
  page,
}) => {
  await mockCalendar(page);
  await page.goto("/phone?tab=appointments&agent=bot-a#booking");
  await expect(page).toHaveURL(/\/calendar\?agent=bot-a#booking$/);
  await expect(
    page.getByRole("heading", { name: "No Appointments Yet", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?agent=bot-a&tab=availability/);
  await expect(page.getByRole("heading", { name: "Weekly Hours", exact: true })).toBeVisible();
});
