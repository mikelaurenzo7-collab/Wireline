import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function mockCalendar(
  page: Page,
  configured = true,
  conflict = false,
  laterConflict = false,
) {
  const writes: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/calendar/settings") {
      await route.fulfill({
        json: {
          configured,
          settings: {
            enabled: configured,
            time_zone: "UTC",
            appointment_name: "Consultation",
            duration_minutes: 30,
            buffer_minutes: 0,
            minimum_notice_minutes: 60,
            booking_mode: "approval",
            weekly_hours: [{ day: 1, start: "09:00", end: "17:00" }],
          },
        },
      });
      return;
    }
    if (path === "/api/calendar/availability") {
      const date = url.searchParams.get("date");
      await route.fulfill({
        json: {
          time_zone: "UTC",
          duration_minutes: 30,
          booking_mode: "approval",
          slots: [
            { date, time: "09:00", start_at: `${date}T09:00:00Z`, end_at: `${date}T09:30:00Z` },
            { date, time: "10:00", start_at: `${date}T10:00:00Z`, end_at: `${date}T10:30:00Z` },
          ],
        },
      });
      return;
    }
    if (path === "/api/appointments" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        await route.fulfill({
          status: conflict ? 409 : 503,
          json: {
            error: conflict ? "That time is no longer available." : "temporarily unavailable",
          },
        });
        return;
      }
      if (laterConflict && writes.length === 2) {
        await route.fulfill({ status: 409, json: { error: "This booking needs review." } });
        return;
      }
      saved = body;
      await route.fulfill({
        json: {
          appointment: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "Requested",
            bookingSource: "native",
            bookingRequestKey: body.request_key,
          },
        },
      });
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
            ? {
                appointments: saved
                  ? [
                      {
                        id: "11111111-1111-4111-8111-111111111111",
                        status: "Requested",
                        booking_source: "native",
                        customer_name: saved.customer_name,
                        date: saved.date,
                        time: saved.time,
                      },
                    ]
                  : [],
                hasMore: false,
                nextCursor: null,
              }
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

for (const width of [320, 1440]) {
  test(`owner booking preserves uncertain requests and fits ${width}px${width === 320 ? " at 200% text" : ""}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockCalendar(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "New appointment", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(page.getByLabel("Customer name", { exact: true })).toBeFocused();
    if (process.env.BOTBOUND_WORKSPACE_PROOF_DIR) {
      await mkdir(process.env.BOTBOUND_WORKSPACE_PROOF_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.BOTBOUND_WORKSPACE_PROOF_DIR,
          `synthetic-calendar-dialog-${width}.png`,
        ),
      });
    }
    if (width === 320)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
    await page.getByLabel("Customer name", { exact: true }).fill("QA Owner Booking");
    await page.getByLabel("Date", { exact: true }).fill("2030-01-08");
    await expect(page.getByLabel("Available time", { exact: true })).toBeEnabled();
    await page.getByLabel("Available time", { exact: true }).selectOption("09:00");
    await page.getByText("More details", { exact: true }).click();
    await page.getByLabel("Appointment type", { exact: true }).fill("QA consultation");
    await page.getByLabel("Notes", { exact: true }).fill("Private QA note retained across retry.");
    await page.getByRole("button", { name: "Request appointment", exact: true }).click();
    await expect(page.getByText("Retry this booking before starting another.")).toBeVisible();
    await expect(page.getByLabel("Customer name", { exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Check booking", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Check booking", exact: true })).toBeFocused();
    await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("QA Owner Booking");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
      "Private QA note retained across retry.",
    );
    await expect
      .poll(() =>
        dialog.locator("*").evaluateAll((elements) =>
          elements
            .filter((element) => {
              const style = getComputedStyle(element);
              return (
                element.clientWidth > 1 &&
                !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) &&
                !["auto", "scroll", "hidden"].includes(style.overflowX) &&
                element.scrollWidth > element.clientWidth + 2
              );
            })
            .map((element) => ({ tag: element.tagName, id: element.id })),
        ),
      )
      .toEqual([]);
    const dialogBounds = (await dialog.boundingBox())!;
    // Bounds alone can pass while a title is squeezed into a few characters
    // per line. Enlarged text must retain a useful full-word reading column.
    const titleLayout = await dialog.getByRole("heading").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      };
    });
    expect(titleLayout.height).toBeLessThanOrEqual(titleLayout.lineHeight * 2 + 2);
    for (const control of await dialog.locator("input, textarea, select").all()) {
      const bounds = await control.boundingBox();
      if (!bounds) continue;
      expect(bounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(dialogBounds.x + dialogBounds.width);
    }
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `output/proofs/calendar-create-${width}px${width === 320 ? "-text200" : ""}.png`,
    });
    await dialog.getByRole("button", { name: "Check booking", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Appointment requested. Confirm it in Calendar.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("QA Owner Booking", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0].request_key).toMatch(/^calendar-owner:/);
    expect(writes[0]).toMatchObject({
      date: "2030-01-08",
      time: "09:00",
      time_zone: "UTC",
      notes: "Private QA note retained across retry.",
    });
  });
}

test("a definite slot conflict preserves the draft and allows a different available time", async ({
  page,
}) => {
  const writes = await mockCalendar(page, true, true);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New appointment", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("QA Conflict Draft");
  await page.getByLabel("Available time", { exact: true }).selectOption("09:00");
  await page.getByRole("button", { name: "Request appointment", exact: true }).click();
  await expect(page.getByText("That time is no longer available.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("QA Conflict Draft");
  await expect(page.getByLabel("Customer name", { exact: true })).toBeEnabled();
  await page.getByLabel("Available time", { exact: true }).selectOption("10:00");
  await page.getByRole("button", { name: "Request appointment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[0].time).toBe("09:00");
  expect(writes[1].time).toBe("10:00");
});

test("an unconfigured calendar directs its owner to availability", async ({ page }) => {
  await mockCalendar(page, false);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Set availability", exact: true }).first().click();
  await expect(page).toHaveURL(/tab=availability/);
  await expect(page.getByRole("heading", { name: "Weekly Hours", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("pending creation ignores repeated clicks and cannot be dismissed", async ({ page }) => {
  await mockCalendar(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/appointments", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes += 1;
    const request = route.request().postDataJSON();
    await gate;
    await route.fulfill({
      json: {
        appointment: {
          id: "11111111-1111-4111-8111-111111111111",
          status: "Requested",
          bookingSource: "native",
          bookingRequestKey: request.request_key,
        },
      },
    });
  });
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New appointment", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("QA Pending");
  await page.getByLabel("Available time", { exact: true }).selectOption("09:00");
  const create = page.getByRole("button", { name: "Request appointment", exact: true });
  await create.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  try {
    await expect.poll(() => writes).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(1);
});

test("a conflict after an uncertain write retains the original frozen request", async ({
  page,
}) => {
  const writes = await mockCalendar(page, true, false, true);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New appointment", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("QA Original Request");
  await page.getByLabel("Available time", { exact: true }).selectOption("09:00");
  await page.getByRole("button", { name: "Request appointment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Check booking", exact: true }).click();
  await expect(page.getByText("Check Calendar, then retry this booking.")).toBeVisible();
  await expect(page.getByLabel("Customer name", { exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Check booking", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[1]).toEqual(writes[2]);
});
