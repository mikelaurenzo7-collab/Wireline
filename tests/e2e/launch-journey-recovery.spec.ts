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

test("a paid Bot's setup guide still opens number selection while new checkout is paused", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/billing/plans", (route) =>
    route.fulfill({ json: { checkout_available: false, stripe_configured: true, plans: [] } }),
  );
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "wireline:post-create-wizard",
      JSON.stringify({
        agentId: "bot-front-desk",
        agentName: "Front Desk",
        phoneProvisionRequested: true,
        phoneProvisioned: false,
        phoneActivationRequired: false,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "launch");
  });
  await page.goto("/studio?agent=bot-front-desk");
  const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
  await expect(guide.getByText("Live activation is paused", { exact: true })).toHaveCount(0);
  await guide.getByRole("button", { name: "Choose a number", exact: true }).click();
  await expect(page).toHaveURL(/\/phone\?tab=setup&agent=bot-front-desk$/);
  await expect(page.getByRole("button", { name: "Find Numbers", exact: true })).toBeVisible();
});

test("caller identity deep links reveal the section", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/phone?tab=setup#company-identity");
  await expect(page.locator("#company-identity")).toHaveAttribute("open", "");
});

test("changing a role starter preserves a supplied customer brief", async ({ page }) => {
  await mockWorkspace(page);
  const brief = "Book a 30-minute appointment only after confirming the customer's ZIP code.";
  await page.goto(`/studio?create=1&brief=${encodeURIComponent(brief)}`);
  const dialog = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
  await dialog.getByText("Start from a Role", { exact: true }).click();
  const description = dialog.getByRole("textbox", { name: "Describe the Job" });
  await expect(description).toHaveValue(brief);
  await dialog
    .getByRole("combobox", { name: "Bot role starters" })
    .selectOption("appointment-setter");
  await expect(description).toHaveValue(brief);
});

for (const failure of ["unavailable", "malformed"] as const) {
  test(`setup guide blocks number activation until ${failure} inventory recovers`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    let recovered = false;
    let provisionCount = 0;
    await page.route("**/api/phone-numbers", (route) =>
      route.fulfill(
        recovered
          ? { status: 200, json: { numbers: [] } }
          : failure === "unavailable"
            ? { status: 503, json: { error: "Phone numbers unavailable." } }
            : { status: 200, json: {} },
      ),
    );
    await page.route("**/api/phone-numbers/provision", async (route) => {
      provisionCount += 1;
      await route.fulfill({ status: 402, json: { code: "ACTIVATION_REQUIRED" } });
    });
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "wireline:post-create-wizard",
        JSON.stringify({
          agentId: "bot-front-desk",
          agentName: "Front Desk",
          phoneProvisionRequested: false,
          phoneProvisioned: false,
          phoneActivationRequired: true,
        }),
      );
      sessionStorage.setItem("wireline:post-create-wizard-step", "launch");
    });
    await page.goto("/studio?agent=bot-front-desk");
    const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
    // Disabled also describes the initial request. Observe the actual failure
    // before allowing the mock to recover, or a pending mount lookup can win.
    await expect(
      guide.getByText("Couldn't refresh phone lines. Retry before provisioning another number."),
    ).toBeVisible();
    await expect(guide.getByRole("button", { name: "Retry Line Lookup" })).toBeEnabled();
    await expect(
      guide.getByRole("button", { name: "Choose a number", exact: true }),
    ).toBeDisabled();
    await expect(guide.getByText("No phone number yet.", { exact: false })).toHaveCount(0);
    recovered = true;
    await guide.getByRole("button", { name: "Retry Line Lookup" }).click();
    await expect(guide.getByRole("button", { name: "Choose a number", exact: true })).toBeEnabled();
    await guide.getByRole("button", { name: "Choose a number", exact: true }).click();
    await expect(page).toHaveURL(/\/phone\?tab=setup&agent=bot-front-desk$/);
    await expect(page.getByRole("button", { name: "Find Numbers", exact: true })).toBeVisible();
    expect(provisionCount).toBe(0);
  });
}

test("Studio keeps a draft unsent until saved conversation history loads", async ({ page }) => {
  await mockWorkspace(page);
  let releaseHistory!: () => void;
  const historyReady = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route("**/api/agents/bot-front-desk/workspace/messages", async (route) => {
    await historyReady;
    await route.fulfill({ json: { messages: [] } });
  });
  await page.goto("/studio?agent=bot-front-desk");
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
  // Below 1180px, one conversation switches between Instructions and Try It.
  await page.setViewportSize({ width: 1024, height: 800 });
  let releaseBuild!: () => void;
  const buildReady = new Promise<void>((resolve) => {
    releaseBuild = resolve;
  });
  await page.route("**/api/agents/bot-front-desk/workspace/messages/stream", async (route) => {
    await buildReady;
    await route
      .fulfill({
        contentType: "text/event-stream",
        body: 'event: done\ndata: {"reply":"Internal configuration reply"}\n\n',
      })
      .catch(() => undefined);
  });
  await page.goto("/studio?agent=bot-front-desk");
  await page
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Use a warm, concise greeting.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  try {
    await expect(
      page.getByRole("button", { name: "Clear conversation", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Try It", exact: true }).click();
    await page.getByRole("button", { name: "Typed", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Customer message for Front Desk" }),
    ).toBeEnabled();
    await expect(page.getByText("Use a warm, concise greeting.", { exact: true })).toHaveCount(0);
  } finally {
    releaseBuild();
  }
  await expect(page.getByText("Internal configuration reply", { exact: true })).toHaveCount(0);
});

test("Studio preserves independent unsent drafts when switching modes and Bots", async ({
  page,
}) => {
  await mockWorkspace(page);
  // Below 1180px, one conversation switches between Instructions and Try It.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/studio?agent=bot-front-desk");
  await page
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Front desk setup draft");
  await page.getByRole("button", { name: "Try It", exact: true }).click();
  await page.getByRole("button", { name: "Typed", exact: true }).click();
  const frontTest = page.getByRole("textbox", { name: "Customer message for Front Desk" });
  await expect(frontTest).toHaveValue("");
  await frontTest.fill("Front desk customer draft");

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-sales");
  await page.getByRole("button", { name: "Typed", exact: true }).click();
  const salesTest = page.getByRole("textbox", { name: "Customer message for Sales Bot" });
  await expect(salesTest).toHaveValue("");
  await salesTest.fill("Sales customer draft");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  const salesBuild = page.getByRole("textbox", { name: "Message Sales Bot", exact: true });
  await expect(salesBuild).toHaveValue("");
  await salesBuild.fill("Sales setup draft");

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-front-desk");
  await expect(page.getByRole("textbox", { name: "Message Front Desk", exact: true })).toHaveValue(
    "Front desk setup draft",
  );
  await page.getByRole("button", { name: "Try It", exact: true }).click();
  await page.getByRole("button", { name: "Typed", exact: true }).click();
  await expect(frontTest).toHaveValue("Front desk customer draft");
  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-sales");
  await page.getByRole("button", { name: "Typed", exact: true }).click();
  await expect(salesTest).toHaveValue("Sales customer draft");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(salesBuild).toHaveValue("Sales setup draft");
});

test("Studio restores edits to a route-injected command after a mode switch", async ({ page }) => {
  await mockWorkspace(page);
  // Below 1180px, one conversation switches between Instructions and Try It.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(
    "/studio?agent=bot-front-desk&workroom=test&command=Original%20question&commandNonce=first",
  );
  const customerMessage = page.getByRole("textbox", { name: "Customer message for Front Desk" });
  await expect(customerMessage).toHaveValue("Original question");
  await customerMessage.fill("Customer edited the original question");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await page.getByRole("button", { name: "Try It", exact: true }).click();
  await page.getByRole("button", { name: "Typed", exact: true }).click();
  await expect(customerMessage).toHaveValue("Customer edited the original question");
});
