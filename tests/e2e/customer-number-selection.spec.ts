import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page, checkoutAvailable: boolean | "unavailable" = true) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
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
    if (path === "/api/billing/plans" && checkoutAvailable === "unavailable") {
      await route.fulfill({ status: 503, json: { error: "Plans temporarily unavailable" } });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "number-owner", email: "owner@example.test", full_name: "Number Owner" } }
          : path === "/api/agents"
            ? { agents: [{ id: "local-bot", name: "Local Business", role: "receptionist" }] }
            : path === "/api/billing/plans"
              ? { checkout_available: checkoutAvailable, stripe_configured: true, plans: [] }
              : { numbers: [], accounts: [], integrations: [], data: [] },
    });
  });
  await page.goto("/phone?tab=setup");
  await page.getByRole("button", { name: "Add Line", exact: true }).click();
}

test("customers search their own area code and activate only the exact selected number", async ({
  page,
}) => {
  await workspace(page);
  const requests: unknown[] = [];
  let searched: unknown;
  let activated = false;
  await page.route("**/api/phone-numbers/search", async (route) => {
    searched = route.request().postDataJSON();
    await route.fulfill({
      json: {
        available: [
          { phone_number: "+15615550101", region: "West Palm Beach, FL" },
          { phone_number: "+15615550102", region: "West Palm Beach, FL" },
        ],
      },
    });
  });
  await page.route("**/api/phone-numbers/provision", async (route) => {
    requests.push(route.request().postDataJSON());
    activated = true;
    await route.fulfill({ json: { ok: true, phone_number: "+15615550102" } });
  });
  await page.route("**/api/phone-numbers", (route) =>
    route.fulfill({
      json: {
        numbers: activated
          ? [{ id: "selected-line", agent_id: "local-bot", phone_number: "+15615550102" }]
          : [],
      },
    }),
  );
  await page.getByRole("textbox", { name: "Area Code (Optional)" }).fill("561");
  const activate = page.getByRole("button", { name: "Activate Line", exact: true });
  await expect(activate).toBeDisabled();
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(2);
  expect(searched).toEqual({ area_code: "561" });
  expect(requests).toEqual([]);
  await page
    .getByRole("radio", { name: "(561) 555-0102 West Palm Beach, FL", exact: true })
    .check();
  await expect(page.getByRole("status", { name: "Number selection" })).toContainText(
    "(561) 555-0102 selected",
  );
  await activate.click();
  await expect(page.getByRole("region", { name: "Selected line" }).getByRole("heading")).toHaveText(
    "(561) 555-0102",
  );
  expect(requests).toEqual([
    { agent_id: "local-bot", phone_number: "+15615550102", area_code: "561" },
  ]);
});

test("changing area codes clears the selection and ignores an earlier search result", async ({
  page,
}) => {
  await workspace(page);
  let releaseSearch!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  let firstStarted = false;
  await page.route("**/api/phone-numbers/search", async (route) => {
    const code = route.request().postDataJSON().area_code;
    if (code === "312") {
      firstStarted = true;
      await pending;
    }
    await route
      .fulfill({ json: { available: [{ phone_number: `+1${code}5550101`, region: "Local" }] } })
      .catch(() => undefined);
  });
  const area = page.getByRole("textbox", { name: "Area Code (Optional)" });
  await area.fill("312");
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await expect.poll(() => firstStarted).toBe(true);
  await area.fill("815");
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "(815) 555-0101 Local", exact: true }),
  ).toBeVisible();
  releaseSearch();
  await page.getByRole("radio", { name: "(815) 555-0101 Local", exact: true }).check();
  await area.fill("224");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toBeDisabled();
});

for (const kind of ["unavailable", "malformed", "null", "wrong-area"] as const) {
  test(`a ${kind} search stays recoverable without buying a number`, async ({ page }) => {
    await workspace(page);
    let recovered = false;
    let purchases = 0;
    await page.route("**/api/phone-numbers/provision", (route) => {
      purchases += 1;
      return route.fulfill({ json: { ok: false } });
    });
    await page.route("**/api/phone-numbers/search", (route) =>
      route.fulfill(
        recovered
          ? { json: { available: [{ phone_number: "+17735550101" }] } }
          : kind === "unavailable"
            ? { status: 404, json: { error: "No inventory in this area code." } }
            : {
                json:
                  kind === "null"
                    ? null
                    : kind === "malformed"
                      ? {}
                      : { available: [{ phone_number: "+13125550101" }] },
              },
      ),
    );
    await page.getByRole("textbox", { name: "Area Code (Optional)" }).fill("773");
    await page.getByRole("button", { name: "Find numbers", exact: true }).click();
    await expect(page.getByText("Lines Need Attention", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toBeDisabled();
    expect(purchases).toBe(0);
    recovered = true;
    await page.getByRole("button", { name: "Find numbers", exact: true }).click();
    await expect(page.getByRole("radio", { name: "(773) 555-0101", exact: true })).toBeVisible();
    await expect(page.getByText("Lines Need Attention", { exact: true })).toHaveCount(0);
  });
}

test("a full plan offers billing recovery even when new checkout is paused", async ({ page }) => {
  await workspace(page, false);
  await page.route("**/api/phone-numbers/available", (route) =>
    route.fulfill({
      status: 403,
      json: {
        code: "PHONE_CAPACITY_REACHED",
        error: "Your plan includes 1 dedicated line; upgrade or add an Extra Agent for more.",
      },
    }),
  );
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await expect(
    page.getByText("Your plan includes 1 dedicated line", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open billing", exact: true })).toHaveAttribute(
    "href",
    "/settings/billing",
  );
  await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toBeDisabled();
  await expect(page.getByText("Try another nearby area code", { exact: false })).toHaveCount(0);
});

for (const checkout of [false, "unavailable"] as const) {
  test(`an entitled customer can choose a number with checkout=${checkout}`, async ({ page }) => {
    await workspace(page, checkout);
    let purchases = 0;
    await page.route("**/api/phone-numbers/provision", (route) => {
      purchases += 1;
      return route.fulfill({ json: { ok: false } });
    });
    await page.route("**/api/phone-numbers/available", (route) =>
      route.fulfill({
        json: { available: [{ phone_number: "+13125550101", region: "Chicago, IL" }] },
      }),
    );
    await page.getByRole("button", { name: "Find numbers", exact: true }).click();
    await page.getByRole("radio", { name: "(312) 555-0101 Chicago, IL", exact: true }).check();
    await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toBeEnabled();
    await expect(page.getByText("Live activation is paused", { exact: true })).toHaveCount(0);
    expect(purchases).toBe(0);
  });
}

test("an unactivated customer gets the paused-sales explanation after the entitlement check", async ({
  page,
}) => {
  await workspace(page, false);
  let purchases = 0;
  await page.route("**/api/phone-numbers/provision", (route) => {
    purchases += 1;
    return route.fulfill({ json: { ok: false } });
  });
  await page.route("**/api/phone-numbers/available", (route) =>
    route.fulfill({
      status: 402,
      json: { code: "ACTIVATION_REQUIRED", error: "Activate a paid plan." },
    }),
  );
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await expect(page.getByText("Live activation is paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toHaveCount(0);
  expect(purchases).toBe(0);
});

test("a reserved line only reports connected after routing is confirmed", async ({ page }) => {
  await workspace(page);
  let confirmed = false;
  let purchases = 0;
  await page.route("**/api/phone-numbers", (route) =>
    route.fulfill({
      json: {
        numbers: [
          {
            id: "reserved-line",
            agent_id: "local-bot",
            phone_number: "+15615550102",
            native_voice_status: confirmed ? "active" : "degraded",
          },
        ],
      },
    }),
  );
  await page.route("**/api/phone-numbers/provision", (route) => {
    purchases += 1;
    return route.fulfill({ json: { ok: false } });
  });
  await page.reload();
  const line = page.getByRole("region", { name: "Selected line" });
  await expect(line.getByText("Connection not confirmed", { exact: true })).toBeVisible();
  await expect(line.getByText("Connected", { exact: true })).toHaveCount(0);
  confirmed = true;
  await line.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect(line.getByText("Connected", { exact: true })).toBeVisible();
  expect(purchases).toBe(0);
});

test("the number choices and activation reflow at 320px with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await workspace(page);
  await page.route("**/api/phone-numbers/available", (route) =>
    route.fulfill({
      json: {
        available: [{ phone_number: "+12125550101", region: "New York, NY" }],
      },
    }),
  );
  await page.getByRole("button", { name: "Find numbers", exact: true }).click();
  await page.getByRole("radio", { name: "(212) 555-0101 New York, NY", exact: true }).check();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const form = page.getByRole("region", { name: "Add phone line" });
  const overflowing = await form.locator("*").evaluateAll((elements) =>
    elements
      .filter((element) => element.clientWidth > 1 && element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName,
        text: element.textContent,
        className: element.className,
      })),
  );
  expect(overflowing).toEqual([]);
  await expect(page.getByRole("button", { name: "Activate Line", exact: true })).toBeEnabled();
});
