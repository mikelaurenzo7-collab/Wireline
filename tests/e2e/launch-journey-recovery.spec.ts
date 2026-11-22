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

test("guides a seller from Registry setup to confirmed screening coverage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.clock.install();
  await page.route("**/api/compliance/center", (route) =>
    route.fulfill({ json: { federal_dnc_configured: false, recent_consent_events: [] } }),
  );
  let submitted: unknown;
  let verifiedSubscription = false;
  await page.route("**/api/campaigns", (route) =>
    route.fulfill({
      json: {
        dnc_setup_needed: !verifiedSubscription,
        campaigns: [
          { id: "fixture-campaign", name: "Fixture campaign", status: "draft", leads_count: 1 },
        ],
      },
    }),
  );
  const san = "FIXTURE-123456";
  const orgId = "11111111-11111";
  await page.route("**/api/compliance/dnc-registration*", (route) => {
    if (route.request().method() === "PUT") submitted = route.request().postDataJSON();
    const verified = submitted && new URL(route.request().url()).searchParams.has("status_only");
    if (verified) verifiedSubscription = true;
    return route.fulfill({
      json: submitted
        ? {
            state: verified ? "active" : "pending_link",
            verification_available: true,
            verification: verified ? null : { state: "pending", ftc_org_id: orgId, san },
            registration: verified
              ? {
                  san,
                  ftc_org_id: orgId,
                  area_codes: ["312", "773"],
                  expires_on: "2027-10-31",
                  verified: true,
                }
              : null,
          }
        : {
            state: "missing",
            registration: null,
            setup: {
              suggested_area_codes: [{ code: "312", contacts: 1 }],
            },
          },
    });
  });
  await page.goto("/phone?tab=outbound&view=campaigns");
  await page.getByRole("link", { name: "Set Up Screening" }).click();
  await expect(page.getByLabel("Area codes to order")).toHaveValue("312");
  await expect(page.getByRole("link", { name: "Open the FTC Registry" })).toHaveAttribute(
    "href",
    "https://telemarketing.donotcall.gov",
  );
  await page.getByRole("button", { name: "I already have a subscription" }).click();
  await page.getByLabel("FTC Organization ID").fill(orgId);
  await page.getByLabel("Subscription number (SAN)").fill(san);
  const verify = page.getByRole("button", { name: "Verify Subscription" });
  await expect(verify).toBeDisabled();
  await page.getByRole("checkbox", { name: /This subscription belongs to my business/ }).check();
  await verify.click();
  await expect(page.getByText("Verifying subscription", { exact: true })).toBeVisible();
  expect(submitted).toEqual({ ftc_org_id: orgId, san, attest: true });
  await page.clock.fastForward(15_000);
  await expect(page.getByText("Subscription verified", { exact: true })).toBeVisible();
  await expect(page.getByText(/312, 773.*October 31, 2027/)).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Go to Campaigns" }).click();
  await expect(page.getByRole("button", { name: "Launch", exact: true })).toBeVisible();
});

test("setup offers cloning at voice selection and resumes before rehearsal", async ({ page }) => {
  await mockWorkspace(page);
  let cloneCreates = 0;
  await page.route("**/api/voice/live-voices", async (route) => {
    if (route.request().method() === "POST") cloneCreates += 1;
    await route.fulfill({
      json: {
        available: true,
        voices: [],
        maxVoices: 3,
        minSeconds: 10,
        recommendedSeconds: 90,
        maxSeconds: 120,
        maxBytes: 10000000,
        consentVersion: "fixture-consent",
        biometricReleaseVersion: "fixture-release",
      },
    });
  });
  await page.route("**/api/agent-config/*", (route) =>
    route.fulfill({
      json: {
        voice: { voiceId: "marin", provider: "openai" },
      },
    }),
  );
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wireline:post-create-wizard")) return;
    sessionStorage.setItem(
      "wireline:post-create-wizard",
      JSON.stringify({
        agentId: "bot-front-desk",
        agentName: "Front Desk",
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "train");
  });
  await page.goto("/studio?agent=bot-front-desk&section=setup");
  const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
  await guide.getByRole("button", { name: "Choose Voice", exact: true }).click();
  await expect(guide.getByRole("heading", { name: "Choose Voice", exact: true })).toBeVisible();
  const cloneVoice = guide.getByRole("button", { name: "Clone Voice", exact: true });
  await expect(cloneVoice).toHaveCount(1);
  await cloneVoice.click();
  await expect(guide.getByText("Step 1 of 3 · Permission", { exact: true })).toBeVisible();
  await expect(guide.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await guide.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(guide.getByRole("heading", { name: "Choose Voice", exact: true })).toBeVisible();
  await guide.getByRole("button", { name: "Continue to Rehearse", exact: true }).click();
  await expect(guide.getByText("Hear It First", { exact: true })).toBeVisible();
  expect(cloneCreates).toBe(0);
});

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

test("a saved setup guide follows its Bot across navigation and reloads", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/studio?agent=bot-sales");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "wireline:post-create-wizard",
      JSON.stringify({
        agentId: "bot-front-desk",
        agentName: "Front Desk",
        phoneProvisionRequested: false,
        phoneProvisioned: false,
        identityBootstrapComplete: true,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "train");
  });

  const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Sales Bot details" })).toBeVisible();
  await expect(guide).toHaveCount(0);

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-front-desk");
  await expect(guide).toBeVisible();

  await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [agents[1]] } }));
  await page.reload();
  await expect(page.getByText("Bot Unavailable", { exact: true })).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("deleting the selected Bot clears its guide and selects the remaining Bot before reload", async ({
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
        "wireline:post-create-wizard",
        JSON.stringify({ agentId: "bot-front-desk", agentName: "Front Desk" }),
      );
    });
    await section.getByRole("button", { name: "Delete Bot", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sales Bot details" })).toBeVisible();
    await expect(page).toHaveURL(/agent=bot-sales/);
    expect(
      await page.evaluate(() => sessionStorage.getItem("wireline:post-create-wizard")),
    ).toBeNull();
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

test("a newly paid Bot can choose a number while new checkout is paused", async ({ page }) => {
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
        phoneActivationRequired: true,
        identityBootstrapComplete: true,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "launch");
  });
  await page.goto("/studio?agent=bot-front-desk");
  const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
  const chooseNumber = guide.getByRole("button", { name: "Choose a number", exact: true });
  await expect(chooseNumber).toBeEnabled();
  await expect(
    guide.getByText("Live activation isn't available right now", { exact: true }),
  ).toHaveCount(0);
  await chooseNumber.click();
  await expect(page).toHaveURL(/\/phone\?tab=setup&agent=bot-front-desk$/);
  await expect(page.getByRole("button", { name: "Find Numbers", exact: true })).toBeVisible();
});

test("a verified checkout returns to the Bot that was being launched", async ({ page }) => {
  await mockWorkspace(page);
  let verifiedSession: string | undefined;
  await page.route("**/api/billing/checkout/verify", async (route) => {
    verifiedSession = route.request().postDataJSON().session_id;
    await route.fulfill({ json: { status: "complete", payment_status: "paid", synced: true } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wireline:post-create-wizard")) return;
    localStorage.setItem("wireline:studio:last-agent-id", "bot-sales");
    sessionStorage.setItem(
      "wireline:post-create-wizard",
      JSON.stringify({
        agentId: "bot-front-desk",
        agentName: "Front Desk",
        phoneProvisionRequested: true,
        phoneProvisioned: false,
        phoneActivationRequired: true,
        identityBootstrapComplete: true,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "launch");
  });

  await page.goto("/settings/billing?billing=success&session_id=cs_setup_fixture");
  await expect(page).toHaveURL(/\/studio\?agent=bot-front-desk$/);
  expect(verifiedSession).toBe("cs_setup_fixture");
  const guide = page.getByRole("dialog", { name: "Next Up for Front Desk" });
  await guide.getByRole("button", { name: "Choose a number", exact: true }).click();
  await expect(page).toHaveURL(/\/phone\?tab=setup&agent=bot-front-desk$/);
  await expect(page.getByRole("combobox", { name: "Bot for this line" })).toHaveText("Front Desk");
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
  const description = dialog.getByRole("textbox", { name: "Describe the Job" });
  await expect(description).toHaveValue(brief);
  await expect(dialog.getByText("Start from a Role", { exact: true })).toHaveCount(0);
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
  await page.goto("/studio?agent=bot-front-desk&chat=setup");
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
  await page.route("**/api/agents/bot-front-desk/workspace/messages/stream", async (route) => {
    await buildReady;
    await route
      .fulfill({
        contentType: "text/event-stream",
        body: 'event: done\ndata: {"reply":"Internal configuration reply"}\n\n',
      })
      .catch(() => undefined);
  });
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
