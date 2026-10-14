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
