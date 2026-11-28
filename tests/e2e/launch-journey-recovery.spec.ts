import { openSavedChat } from "./helpers/studio-chat-history";
import { expect, test, type Page } from "@playwright/test";

const agents = [
  { id: "bot-front-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales Bot", role: "sales" },
];
const initialLine = {
  id: "line-front-desk",
  agent_id: agents[0].id,
  phone_number: "+13125550100",
  created_at: "2026-09-01T12:00:00Z",
};

async function mockWorkspace(page: Page) {
  // Every API route is intercepted so this journey never spends provider funds
  // or reads/writes a connected account or database.
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
    const payload =
      path === "/api/auth/session"
        ? { user: { id: "journey-owner", email: "owner@example.test", full_name: "Journey Owner" } }
        : path === "/api/agents"
          ? { agents }
          : path === "/api/billing/plans"
            ? { checkout_available: true, stripe_configured: true, plans: [] }
            : path === "/api/phone-numbers/available"
              ? { available: [{ phone_number: "+13125550101", region: "Chicago, IL" }] }
              : { accounts: [], data: [], numbers: [], integrations: [] };
    await route.fulfill({ status: 200, json: payload });
  });
}

test("a second Bot keeps its own activation selection and opens its new line", async ({ page }) => {
  await mockWorkspace(page);
  const lines = [initialLine];
  let provisionedAgent: string | undefined;
  await page.route("**/api/phone-numbers", (route) => route.fulfill({ json: { numbers: lines } }));
  await page.route("**/api/phone-numbers/provision", async (route) => {
    provisionedAgent = route.request().postDataJSON().agent_id;
    lines.push({
      id: "line-sales",
      agent_id: provisionedAgent!,
      phone_number: "+13125550101",
      created_at: "2026-09-17T12:00:00Z",
    });
    await route.fulfill({ json: { ok: true, phone_number: "+13125550101" } });
  });

  await page.goto("/phone?tab=setup");
  await page.getByRole("button", { name: "Add Line", exact: true }).click();
  const botSelection = page.getByRole("combobox", { name: "Bot for this line" });
  await botSelection.click();
  await page.getByRole("option", { name: "Sales Bot", exact: true }).click();
  await expect(botSelection).toHaveText("Sales Bot");
  await page.getByRole("button", { name: "Find Numbers", exact: true }).click();
  await page.getByRole("radio", { name: "(312) 555-0101 Chicago, IL", exact: true }).check();
  await page
    .getByRole("region", { name: "Add phone line" })
    .getByRole("button", { name: "Activate Line", exact: true })
    .click();

  await expect.poll(() => provisionedAgent).toBe(agents[1].id);
  await expect(page.getByRole("region", { name: "Selected line" }).getByRole("heading")).toHaveText(
    "(312) 555-0101",
  );
  await expect(page.getByRole("combobox", { name: "Assigned Bot" })).toHaveText("Sales Bot");
});

test("Bo's first conversation resumes at its question, and only for a Bot the account has", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/studio?agent=bot-sales");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "wireline:bo-onboarding:v1:journey-owner",
      JSON.stringify({ agentId: "bot-front-desk", step: "questions" }),
    );
  });

  const conversation = page.getByRole("log", { name: "Conversation with Front Desk" });
  await page.reload();
  await expect(conversation).toContainText("What do customers usually ask you?");
  await expect(page.getByText("Step 3 of 4", { exact: true })).toBeVisible();
  await page.reload();
  await expect(conversation).toContainText("What do customers usually ask you?");

  await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [agents[1]] } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Sales Bot details" })).toBeVisible();
  await expect(conversation).toHaveCount(0);
});

test("deleting the selected Bot selects the remaining Bot and never resumes its first conversation", async ({
  page,
}) => {
  await mockWorkspace(page);
  let deleted = false;
  let releaseRoster: () => void = () => {};
  const reload = new Promise<void>((resolve) => {
    releaseRoster = resolve;
  });
  await page.route("**/api/agents", async (route) => {
    if (deleted) await reload;
    await route.fulfill({ json: { agents: deleted ? [agents[1]] : agents } });
  });
  await page.route("**/api/agents/bot-front-desk/deletion", (route) =>
    route.fulfill({
      json: { name: "Front Desk", phone_numbers: [], mailboxes: [], blocked_by: null },
    }),
  );
  await page.route("**/api/agents/bot-front-desk", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleted = true;
    await route.fulfill({
      json: { deleted: true, phone_numbers_released: 0, mailboxes_released: 0 },
    });
  });

  try {
    await page.goto("/studio?agent=bot-front-desk&section=setup");
    const section = page.getByRole("region", { name: "Delete Bot" });
    await section.locator("summary").click();
    await section.getByLabel("Type DELETE to Confirm").fill("DELETE");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "wireline:bo-onboarding:v1:journey-owner",
        JSON.stringify({ agentId: "bot-front-desk", step: "website" }),
      );
    });
    await section.getByRole("button", { name: "Delete Bot", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sales Bot details" })).toBeVisible();
    await expect(page).toHaveURL(/agent=bot-sales/);
    await expect(page.getByRole("log", { name: /^Conversation with / })).toHaveCount(0);
  } finally {
    releaseRoster();
  }
});

test("an unconfirmed Bot deletion stays scoped and requires a fresh check before retry", async ({
  page,
}, testInfo) => {
  await mockWorkspace(page);
  let checks = 0;
  let recovered = false;
  const deletions: string[] = [];
  await page.route("**/api/agents/bot-front-desk/deletion", (route) => {
    checks += 1;
    return route.fulfill(
      checks > 1 && !recovered
        ? { status: 503, json: { error: "Deletion check unavailable." } }
        : {
            json: {
              name: "Front Desk",
              phone_numbers: ["+13125550100"],
              mailboxes: ["desk@example.test"],
              blocked_by: null,
            },
          },
    );
  });
  await page.route("**/api/agents/bot-front-desk", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletions.push(route.request().url());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/studio?agent=bot-front-desk&section=setup");
  const section = page.getByRole("region", { name: "Delete Bot", exact: true });
  await section.locator("summary").click();
  await section.getByLabel("Type DELETE to Confirm").fill("DELETE");
  await section.getByRole("button", { name: "Delete Bot", exact: true }).click();
  await expect(section.getByText(/Deletion could not be confirmed/)).toBeVisible();
  await expect(section.getByText("Deletion check unavailable.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/agent=bot-front-desk/);
  await expect(section.getByRole("button", { name: "Delete Bot", exact: true })).toHaveCount(0);
  expect(deletions).toHaveLength(1);
  await section.screenshot({ path: testInfo.outputPath("deletion-recheck-unavailable.png") });
  recovered = true;
  await section.getByRole("button", { name: "Try Again", exact: true }).click();
  await expect(section.getByLabel("Type DELETE to Confirm")).toHaveValue("");
  await expect(section.getByText(/desk@example.test/)).toBeVisible();
  await expect(section.getByRole("button", { name: "Delete Bot", exact: true })).toBeDisabled();
  expect(deletions).toHaveLength(1);
});

for (const kind of ["missing", "malformed", "unknown block"] as const) {
  test(`a ${kind} Bot deletion preview stays unavailable and can recover`, async ({ page }) => {
    await mockWorkspace(page);
    let recovered = false;
    let deletes = 0;
    await page.route("**/api/agents/bot-front-desk/deletion", (route) =>
      route.fulfill({
        json: recovered
          ? { name: "Front Desk", phone_numbers: [], mailboxes: [], blocked_by: null }
          : kind === "missing"
            ? {}
            : {
                name: "Front Desk",
                phone_numbers: kind === "malformed" ? "unconfirmed" : [],
                mailboxes: [],
                blocked_by: kind === "unknown block" ? "unknown" : null,
              },
      }),
    );
    await page.route("**/api/agents/bot-front-desk", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deletes += 1;
      return route.fulfill({ json: { deleted: true } });
    });
    await page.goto("/studio?agent=bot-front-desk&section=setup");
    const section = page.getByRole("region", { name: "Delete Bot", exact: true });
    await section.locator("summary").click();
    await expect(section.getByText(/deletion check could not be confirmed/i)).toBeVisible();
    await expect(section.getByLabel("Type DELETE to Confirm")).toHaveCount(0);
    expect(deletes).toBe(0);
    recovered = true;
    await section.getByRole("button", { name: "Try Again", exact: true }).click();
    await expect(section.getByLabel("Type DELETE to Confirm")).toHaveValue("");
    await expect(section.getByRole("button", { name: "Delete Bot", exact: true })).toBeDisabled();
    expect(deletes).toBe(0);
  });
}

for (const [block, message] of [
  ["live_call", "This Bot is on a call or still wrapping one up."],
  ["outbound_call", "This Bot is placing a call."],
  ["computer_task", "This Bot is working on a computer task."],
  ["identity_setup", "This Bot's number or mailbox is being set up."],
] as const) {
  test(`a ${block} deletion preview explains the active work and cannot submit`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    let deletes = 0;
    await page.route("**/api/agents/bot-front-desk/deletion", (route) =>
      route.fulfill({
        json: {
          name: "Front Desk",
          phone_numbers: [],
          mailboxes: [],
          blocked_by: block,
        },
      }),
    );
    await page.route("**/api/agents/bot-front-desk", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deletes += 1;
      return route.fulfill({ json: { deleted: true } });
    });
    await page.goto("/studio?agent=bot-front-desk&section=setup");
    const section = page.getByRole("region", { name: "Delete Bot", exact: true });
    await section.locator("summary").click();
    await expect(section.getByText(message, { exact: false })).toBeVisible();
    await expect(section.getByLabel("Type DELETE to Confirm")).toHaveCount(0);
    expect(deletes).toBe(0);
  });
}

test("a late confirmed deletion refreshes the roster without interrupting current work", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let deleting = false;
  let deleted = false;
  let rosterReads = 0;
  await page.route("**/api/agents", (route) => {
    rosterReads += 1;
    return route.fulfill({ json: { agents: deleted ? [agents[1]] : agents } });
  });
  await page.route("**/api/agents/bot-front-desk/deletion", (route) =>
    route.fulfill({
      json: {
        name: "Front Desk",
        phone_numbers: [],
        mailboxes: [],
        blocked_by: null,
      },
    }),
  );
  await page.route("**/api/agents/bot-front-desk", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleting = true;
    await ready;
    deleted = true;
    await route.fulfill({
      json: { deleted: true, phone_numbers_released: 0, mailboxes_released: 0 },
    });
  });
  try {
    await page.goto("/studio?agent=bot-front-desk&section=setup");
    const section = page.getByRole("region", { name: "Delete Bot", exact: true });
    await section.locator("summary").click();
    await section.getByLabel("Type DELETE to Confirm").fill("DELETE");
    await section.getByRole("button", { name: "Delete Bot", exact: true }).click();
    await expect.poll(() => deleting).toBe(true);
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption("bot-sales");
    await page.getByRole("button", { name: "Back to Work", exact: true }).click();
    const composer = page.getByRole("textbox", { name: "Message Sales Bot", exact: true });
    await expect(composer).toBeVisible();
    await composer.fill("Keep my Sales draft while the other Bot finishes.");
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
    const before = rosterReads;
    release();
    await expect.poll(() => rosterReads).toBeGreaterThan(before);
    await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
    await page.goBack();
    await expect(page).toHaveURL(/agent=bot-sales/);
    await expect(composer).toHaveValue("Keep my Sales draft while the other Bot finishes.");
  } finally {
    release();
  }
});

for (const failure of ["unavailable", "malformed"] as const) {
  test(`phone inventory ${failure} stays distinct from an empty account and can recover`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    let recovered = false;
    await page.route("**/api/phone-numbers", (route) =>
      route.fulfill(
        recovered
          ? { status: 200, json: { numbers: [] } }
          : failure === "unavailable"
            ? { status: 503, json: { error: "Phone numbers unavailable." } }
            : { status: 200, json: {} },
      ),
    );

    await page.goto("/phone?tab=setup");
    await expect(page.getByText("Lines Need Attention", { exact: true })).toBeVisible();
    await expect(page.getByText("No Line Yet", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Line", exact: true })).toHaveCount(0);
    recovered = true;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("No Line Yet", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Line", exact: true })).toBeEnabled();
  });
}

test("caller identity deep links reveal the section", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/phone?tab=setup#company-identity");
  await expect(page.locator("#company-identity")).toHaveAttribute("open", "");
});

test("texting registration collects a sole proprietor's details and lists every fix", async ({
  page,
}) => {
  await mockWorkspace(page);
  const options = {
    businessTypes: ["Limited Liability Corporation", "Corporation"],
    industries: ["PROFESSIONAL_SERVICES", "REAL_ESTATE"],
    verticals: ["PROFESSIONAL", "REAL_ESTATE"],
    jobPositions: ["CEO", "Other"],
  };
  const empty = {
    status: "needs_details",
    flow: null,
    summary: null,
    details: null,
    submitted_at: null,
    default_brand_name: "Ridge Inspections",
    options,
  };
  const saves: Array<Record<string, unknown>> = [];
  await page.route("**/api/texting-registration", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: empty });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    saves.push(body);
    if (saves.length === 1) {
      await route.fulfill({
        status: 400,
        json: {
          error: "Some business details need a fix before they can be saved.",
          code: "TEXTING_REGISTRATION_INVALID",
          details: {
            problems: [
              "Use your own cell phone for the carrier confirmation text, not a BotBound line.",
            ],
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        ok: true,
        ...empty,
        status: "received",
        flow: "sole_proprietor",
        summary: { brandName: "Ridge Inspections", einLastFour: null },
        details: body.details,
        submitted_at: "2026-11-22T12:00:00Z",
      },
    });
  });

  await page.goto("/phone?tab=setup#texting-registration");
  const section = page.locator("#texting-registration");
  await expect(section).toHaveAttribute("open", "");
  await section.getByRole("radio", { name: "I'm a sole proprietor without an EIN" }).check();
  await expect(section.getByRole("textbox", { name: "Brand name", exact: true })).toHaveValue(
    "Ridge Inspections",
  );
  await expect(section.getByRole("textbox", { name: "EIN" })).toHaveCount(0);
  await section.getByRole("textbox", { name: "First name" }).fill("Pat");
  await section.getByRole("textbox", { name: "Last name" }).fill("Lee");
  await section.getByRole("textbox", { name: "Email" }).fill("pat@example.com");
  await section
    .getByRole("textbox", { name: "Your cell phone", exact: true })
    .fill("(312) 555-0100");
  await section.getByRole("combobox", { name: "Kind of work" }).selectOption("REAL_ESTATE");
  await section.getByRole("textbox", { name: "Street" }).fill("1 Main St");
  await section.getByRole("textbox", { name: "City" }).fill("Springfield");
  await section.getByRole("textbox", { name: "State", exact: true }).fill("il");
  await section.getByRole("textbox", { name: "ZIP code" }).fill("62701");
  await section.getByRole("button", { name: "Save business details" }).click();

  await expect(section.getByRole("alert")).toContainText("not a BotBound line");
  expect(saves[0]).toMatchObject({
    flow: "sole_proprietor",
    details: { mobilePhone: "(312) 555-0100", address: { region: "IL" } },
  });

  await section
    .getByRole("textbox", { name: "Your cell phone", exact: true })
    .fill("(312) 555-0199");
  await section.getByRole("button", { name: "Save business details" }).click();
  await expect(section.getByRole("status")).toContainText("reply YES within 24 hours");
  await expect(section.getByRole("button", { name: "Save changes" })).toBeVisible();
});

test("a supplied brief starts as an unsent chat draft for the account's Bot", async ({ page }) => {
  await mockWorkspace(page);
  const brief = "Book a 30-minute appointment only after confirming the customer's ZIP code.";
  await page.goto(`/studio?agent=bot-front-desk&brief=${encodeURIComponent(brief)}`);
  await expect(page.getByRole("textbox", { name: /Message|Conversation/ }).first()).toHaveValue(
    brief,
  );
  await expect(page).not.toHaveURL(/brief=/);
  await expect(page.getByText("Start from a Role", { exact: true })).toHaveCount(0);
});

test("Studio keeps a draft unsent until saved conversation history loads", async ({ page }) => {
  await mockWorkspace(page);
  let releaseHistory!: () => void;
  const historyReady = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route("**/api/agents/bot-front-desk/workspace/messages?thread=*", async (route) => {
    await historyReady;
    await route.fulfill({ json: { messages: [] } });
  });
  await page.goto("/studio?agent=bot-front-desk&chat=setup");
  await openSavedChat(page);
  const composer = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
  try {
    await composer.fill("Use a warm, concise greeting.");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  } finally {
    releaseHistory();
  }
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(composer).toHaveValue("Use a warm, concise greeting.");
});

test("switching from Build to Test isolates an unfinished configuration response", async ({
  page,
}) => {
  await mockWorkspace(page);
  // Below 1180px, one conversation switches between Instructions and Rehearse.
  await page.setViewportSize({ width: 1024, height: 800 });
  let releaseBuild!: () => void;
  const buildReady = new Promise<void>((resolve) => {
    releaseBuild = resolve;
  });
  await page.route(
    "**/api/agents/bot-front-desk/workspace/messages/stream?thread=*",
    async (route) => {
      await buildReady;
      await route
        .fulfill({
          contentType: "text/event-stream",
          body: 'event: done\ndata: {"reply":"Internal configuration reply"}\n\n',
        })
        .catch(() => undefined);
    },
  );
  await page.goto("/studio?agent=bot-front-desk&chat=setup");
  await page
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Use a warm, concise greeting.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  try {
    await expect(
      page.getByRole("button", { name: "Clear conversation", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Rehearse", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
    await expect(page.getByText("Use a warm, concise greeting.", { exact: true })).toHaveCount(0);
  } finally {
    releaseBuild();
  }
  await expect(page.getByText("Internal configuration reply", { exact: true })).toHaveCount(0);
});

test("Studio preserves each Bot's configuration draft through voice rehearsal", async ({
  page,
}) => {
  await mockWorkspace(page);
  // Below 1180px, one conversation switches between Instructions and Rehearse.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/studio?agent=bot-front-desk&chat=setup");
  await page
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Front desk setup draft");
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-sales");
  await expect(page.getByText("Speak With Sales Bot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  const salesBuild = page.getByRole("textbox", { name: "Message Sales Bot", exact: true });
  await expect(salesBuild).toHaveValue("");
  await salesBuild.fill("Sales setup draft");

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-front-desk");
  await expect(page.getByRole("textbox", { name: "Message Front Desk", exact: true })).toHaveValue(
    "Front desk setup draft",
  );
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await expect(page.getByText("Speak With Front Desk", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-sales");
  await expect(page.getByText("Speak With Sales Bot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await expect(salesBuild).toHaveValue("Sales setup draft");
});

test("a legacy rehearsal command never becomes a configuration instruction after switching modes", async ({
  page,
}) => {
  await mockWorkspace(page);
  // Below 1180px, one conversation switches between Instructions and Rehearse.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(
    "/studio?agent=bot-front-desk&workroom=test&command=Original%20question&commandNonce=first",
  );
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  const configure = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
  await expect(configure).toHaveValue("");
  await configure.fill("My configuration draft");
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await expect(configure).toHaveValue("My configuration draft");
});
