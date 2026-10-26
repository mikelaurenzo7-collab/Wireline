import { expect, test, type Page } from "@playwright/test";

const bots = [
  { id: "bot-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales", role: "sales" },
];
const mailboxes = [
  { id: "mail-desk", emailAddress: "desk@example.test", provider: "managed", agentId: "bot-desk" },
  {
    id: "mail-sales",
    emailAddress: "sales@example.test",
    provider: "managed",
    agentId: "bot-sales",
  },
];

async function mockWorkspace(page: Page) {
  const threadRequests: URL[] = [];
  // Keep the whole journey local: no account/database reads or provider work.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/billing/status") {
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
    if (url.pathname === "/api/emails/threads") threadRequests.push(url);
    const json =
      url.pathname === "/api/auth/session"
        ? { user: { id: "inbox-owner", email: "owner@example.test" } }
        : url.pathname === "/api/agents"
          ? { agents: bots }
          : url.pathname === "/api/emails/accounts"
            ? { accounts: mailboxes }
            : { accounts: [], data: [], numbers: [], integrations: [], threads: [] };
    await route.fulfill({ json });
  });
  return threadRequests;
}

test("an existing SMS subscriber sees the SMS tab and payment recovery", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/api/billing/status", (route) =>
    route.fulfill({
      json: {
        channel_entitlements: {
          plan_id: "sms",
          subscription_status: "past_due",
          channels: [],
          is_owner: false,
        },
      },
    }),
  );

  await page.goto("/inbox");
  await expect(page.getByRole("button", { name: "SMS", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByText("Payment Needs Attention", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Update Payment" })).toHaveAttribute(
    "href",
    "/settings/billing",
  );
  await expect(page.getByText("SMS Coming Soon", { exact: true })).toHaveCount(0);
});

test("unpaid SMS discovery preserves saved texts and cannot draft or send", async ({ page }) => {
  await mockWorkspace(page);
  const sendRequests: string[] = [];
  await page.route("**/api/billing/status", (route) =>
    route.fulfill({
      json: {
        channel_entitlements: {
          plan_id: null,
          subscription_status: "none",
          channels: [],
          is_owner: false,
        },
      },
    }),
  );
  await page.route("**/api/sms/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/reply") || path.endsWith("/draft")) sendRequests.push(path);
    return route.fulfill({
      json:
        path === "/api/sms/threads"
          ? {
              threads: [
                {
                  id: "saved-sms",
                  customer_number: "+12025550101",
                  destination_number: "+12025550102",
                  status: "open",
                  unread_count: 0,
                  last_message_at: "2026-10-25T12:00:00Z",
                },
              ],
            }
          : path.endsWith("/messages")
            ? {
                messages: [
                  {
                    id: "saved-message",
                    direction: "in",
                    body: "Can we move our appointment?",
                    created_at: "2026-10-25T12:00:00Z",
                    agent_id: "bot-desk",
                  },
                ],
              }
            : {},
    });
  });
  await page.goto("/inbox?tab=sms&thread=saved-sms");
  await expect(page.getByRole("button", { name: "SMS", exact: true })).toBeVisible();
  await expect(page.getByText("SMS Isn't in Your Plan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Can we move our appointment?", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text reply", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Write reply with Bot", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send text", exact: true })).toBeDisabled();
  expect(sendRequests).toEqual([]);
});

test("a mailbox deep link never requests all conversations while its scope loads", async ({
  page,
}) => {
  const requests = await mockWorkspace(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/emails/accounts", async (route) => {
    await ready;
    await route.fulfill({ json: { accounts: mailboxes } });
  });

  await page.goto("/inbox?agent=bot-desk&account=mail-desk");
  try {
    await expect(page.getByText("Loading selected inbox…", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Approvals", exact: true })).toBeVisible();
  } finally {
    release();
  }
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(
    requests.every(
      (url) =>
        url.searchParams.get("agent_id") === "bot-desk" &&
        url.searchParams.get("account_id") === "mail-desk",
    ),
  ).toBe(true);
  await expect(page.getByRole("combobox", { name: "Filter email by mailbox" })).toHaveValue(
    "mail-desk",
  );
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox\?tab=approvals$/);
});

for (const failure of ["unavailable", "malformed"] as const) {
  test(`a ${failure} mailbox lookup keeps the selected scope and can recover`, async ({ page }) => {
    const requests = await mockWorkspace(page);
    let recovered = false;
    await page.route("**/api/emails/accounts", (route) =>
      route.fulfill(
        recovered
          ? { json: { accounts: mailboxes } }
          : failure === "unavailable"
            ? { status: 503, json: { error: "Temporarily unavailable" } }
            : { json: {} },
      ),
    );
    await page.goto("/inbox?account=mail-desk");
    await expect(page.getByText("Selected Inbox Unavailable", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
    await expect(page).toHaveURL(/account=mail-desk/);
    recovered = true;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    expect(requests.every((url) => url.searchParams.get("account_id") === "mail-desk")).toBe(true);
  });
}

test("an unavailable Bot does not silently become All Bots", async ({ page }) => {
  const requests = await mockWorkspace(page);
  await page.goto("/inbox?agent=removed-bot");
  await expect(page.getByText("Selected Inbox Unavailable", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("combobox", { name: "Filter Inbox by Bot" })).toHaveValue(
    "removed-bot",
  );

  await page.getByRole("button", { name: "Clear Filters", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => !url.searchParams.has("agent_id"))).toBe(true);
  await expect(page).not.toHaveURL(/agent=/);
});

test("a Bot deep link waits for the roster without requesting every Bot's email", async ({
  page,
}) => {
  const requests = await mockWorkspace(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/agents", async (route) => {
    await ready;
    await route.fulfill({ json: { agents: bots } });
  });
  await page.goto("/inbox?agent=bot-sales");
  try {
    await expect(page.getByText("Loading selected inbox…", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  } finally {
    release();
  }
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.searchParams.get("agent_id") === "bot-sales")).toBe(true);
});

test("a degraded roster can recover without clearing the chosen Bot", async ({ page }) => {
  const requests = await mockWorkspace(page);
  let recovered = false;
  await page.route("**/api/agents", (route) =>
    route.fulfill(
      recovered
        ? { json: { agents: bots } }
        : { status: 503, json: { degraded: true, agents: [] } },
    ),
  );
  await page.goto("/inbox?agent=bot-desk");
  await expect(
    page.getByText("We couldn't verify this Bot. Retry to load its conversations."),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  recovered = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.searchParams.get("agent_id") === "bot-desk")).toBe(true);
  await expect(page).toHaveURL(/agent=bot-desk/);
});

test("a mailbox for a different Bot stays blocked until the user changes the filter", async ({
  page,
}) => {
  const requests = await mockWorkspace(page);
  await page.goto("/inbox?agent=bot-desk&account=mail-sales");
  await expect(page.getByText("Selected Inbox Unavailable", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole("combobox", { name: "Filter email by mailbox" }).selectOption("mail-desk");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(
    requests.every(
      (url) =>
        url.searchParams.get("agent_id") === "bot-desk" &&
        url.searchParams.get("account_id") === "mail-desk",
    ),
  ).toBe(true);
});
