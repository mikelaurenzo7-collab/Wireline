import { expect, test, type Locator, type Page } from "@playwright/test";

// Below 1180px, Set Up switches one conversation between Instructions and Try It. The
// side-by-side layout above that width has its own spec (workspace-panel.spec.ts).
test.use({ viewport: { width: 1024, height: 800 } });

const bots = [
  { id: "bot-front-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales Bot", role: "sales" },
];
const opening = {
  field: "first_message",
  label: "Opening greeting",
  value: "Hello from our team.",
  summary: "Use this opening.",
};
const emailCapability = {
  tool: "send_email",
  enable: true,
  label: "Email capability",
  reason: "Allow approved email follow-ups.",
};
const emailDraft = {
  kind: "send_email",
  label: "Follow-up email",
  to: "customer@example.test",
  subject: "Your appointment request",
  body: `Thank you for contacting our team. Reference: ${"confirmation".repeat(14)}`,
};
const plan = {
  reply: "Review the opening greeting before saving it.",
  changes: [opening],
  toolToggles: [emailCapability],
  actions: [emailDraft],
};

async function mockWorkspace(page: Page) {
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postData() ? request.postDataJSON() : null });
    }
    // Every endpoint stays mocked: no account/database/provider traffic runs.
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "proposal-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: bots }
            : path.startsWith("/api/agent-config/")
              ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
              : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
  await page.route("**/api/agents/*/workspace/messages/stream", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `event: done\ndata: ${JSON.stringify(plan)}\n\n`,
    }),
  );
  return writes;
}

async function requestProposal(page: Page) {
  await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
  await page
    .getByRole("textbox", { name: "Message Front Desk", exact: true })
    .fill("Suggest a new opening and a follow-up email.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const review = page.getByRole("region", { name: "Review Opening greeting", exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByText(opening.value, { exact: true })).toBeVisible();
  return review;
}

test("Studio review cards and saved receipts survive a full page reload", async ({ page }) => {
  await mockWorkspace(page);
  let persisted = false;
  let saved = false;
  const writes: unknown[] = [];
  await page.route("**/api/agents/bot-front-desk/workspace/messages", (route) =>
    route.fulfill({
      json: {
        messages: persisted
          ? [
              {
                id: "42",
                role: "agent",
                content: plan.reply,
                createdAt: "2026-10-11T00:00:00.000Z",
                proposals: { changes: [opening], toolToggles: [], actions: [] },
                savedProposalKeys: saved ? ["change-0"] : [],
              },
            ]
          : [],
      },
    }),
  );
  await page.route("**/api/agents/bot-front-desk/workspace/messages/stream", (route) => {
    persisted = true;
    return route.fulfill({
      contentType: "text/event-stream",
      body: `event: done\ndata: ${JSON.stringify({
        reply: plan.reply,
        changes: [opening],
        toolToggles: [],
        actions: [],
        messageId: "42",
      })}\n\n`,
    });
  });
  await page.route("**/api/agents/bot-front-desk/workspace/apply-change", (route) => {
    writes.push(route.request().postDataJSON());
    saved = true;
    return route.fulfill({
      json: {
        success: true,
        field: opening.field,
        value: opening.value,
        savedProposalKey: "change-0",
      },
    });
  });

  await requestProposal(page);
  await page.reload();
  const review = page.getByRole("region", { name: "Review Opening greeting", exact: true });
  await expect(review.getByRole("button", { name: "Save Opening greeting" })).toBeVisible();
  await review.getByRole("button", { name: "Save Opening greeting" }).click();
  await expect(review.getByText("Saved", { exact: true })).toBeVisible();
  await expect(review.getByText(opening.value, { exact: true })).toBeHidden();
  const receipt = review.locator("summary");
  await expect(receipt).toBeFocused();
  await receipt.press("Enter");
  await expect(review.getByText(opening.value, { exact: true })).toBeVisible();
  await receipt.press("Enter");
  expect(writes).toEqual([
    {
      field: opening.field,
      value: opening.value,
      proposalMessageId: "42",
      proposalKey: "change-0",
    },
  ]);
  await page.reload();
  await expect(review.getByText("Saved", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Save Opening greeting" })).toHaveCount(0);
  await expect(review.getByText(opening.value, { exact: true })).toBeHidden();
});

test("Studio opens Computer for the Bot currently selected", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`/studio?agent=${bots[1].id}`);

  const browser = page
    .getByRole("navigation", { name: "Workspace view" })
    .getByRole("button", { name: "Browser", exact: true });
  await browser.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/studio" &&
      url.searchParams.get("agent") === bots[1].id &&
      url.searchParams.get("panel") === "computer",
  );
  await expect(page.locator("#computer-agent")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Switch Bot", exact: true })).toHaveValue(
    bots[1].id,
  );
  await expect(page.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
});

test("mobile Work, Configure, and Browser share one row without losing a task draft", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto(`/studio?agent=${bots[1].id}`);
  const views = page.getByRole("navigation", { name: "Workspace view" });
  const draft = page.getByRole("textbox", { name: /^Task for / });
  await expect(draft).toBeVisible();
  expect(
    await draft.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(54);
  await draft.fill("Keep this unsent task while I inspect my Bot.");
  await views.getByRole("button", { name: "Browser", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
  await views.getByRole("button", { name: "Configure", exact: true }).click();
  await expect(views.getByRole("button", { name: "Configure", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await views.getByRole("button", { name: "Work", exact: true }).click();
  await expect(draft).toHaveValue("Keep this unsent task while I inspect my Bot.");
  await expect(page.getByRole("button", { name: "Work", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Configure", exact: true })).toHaveCount(1);
  await draft.fill("");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  const inputMetrics = await draft.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      line:
        parseFloat(style.lineHeight) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom),
    };
  });
  expect(inputMetrics.height).toBeGreaterThanOrEqual(inputMetrics.line);
  await draft.scrollIntoViewIfNeeded();
  await expect(draft).toBeInViewport();
  await page.screenshot({ path: info.outputPath("work-composer-enlarged.png"), fullPage: true });
});

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
              style.overflowX !== "scroll" &&
              style.textOverflow !== "ellipsis"
            );
          })
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 70)}`),
      ),
    )
    .toEqual([]);
}

for (const failure of ["unavailable", "malformed"] as const) {
  test(`a ${failure} proposal save remains reviewable and retries without duplicate writes`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    const requests: unknown[] = [];
    let releaseRetry!: () => void;
    const retryReady = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    await page.route("**/api/agents/bot-front-desk/workspace/apply-change", async (route) => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        await route.fulfill(
          failure === "unavailable"
            ? { status: 500, json: { error: "Could not save the greeting." } }
            : { json: { success: true } },
        );
      } else {
        await retryReady;
        await route.fulfill({
          json: {
            success: true,
            field: opening.field,
            label: opening.label,
            value: opening.value,
          },
        });
      }
    });

    const review = await requestProposal(page);
    const save = review.getByRole("button", { name: "Save Opening greeting", exact: true });
    expect(requests).toHaveLength(0);
    await save.click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(save).toBeEnabled();
    await expect(review.getByRole("alert")).toBeVisible();
    await expect(review.getByText(opening.value, { exact: true })).toBeVisible();
    await expect(review.getByText("Saved", { exact: true })).toHaveCount(0);

    await save.click();
    try {
      await expect.poll(() => requests.length).toBe(2);
      await expect(save).toBeDisabled();
      await page.keyboard.press("Enter");
      expect(requests).toHaveLength(2);
      await page.getByRole("button", { name: "Rehearse", exact: true }).click();
      await expect(review).toHaveCount(0);
      await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
      await expect(review.getByText(opening.value, { exact: true })).toBeVisible();
      await expect(save).toBeDisabled();
      expect(requests).toHaveLength(2);
      await page.getByRole("link", { name: "Open Inbox", exact: true }).click();
      await expect(page).toHaveURL(/\/inbox\?tab=email&agent=bot-front-desk$/);
      await page.goBack();
      await expect(review).toBeVisible();
      await expect(save).toBeDisabled();
      expect(requests).toHaveLength(2);
    } finally {
      releaseRetry();
    }
    await expect(review.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Open Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox\?tab=email&agent=bot-front-desk$/);
    await page.goBack();
    await expect(review.getByText("Saved", { exact: true })).toBeVisible();
    expect(requests).toEqual([
      { field: opening.field, value: opening.value },
      { field: opening.field, value: opening.value },
    ]);
  });
}

test("a tool proposal requires a confirmed enabled-tool result and remains retryable", async ({
  page,
}) => {
  await mockWorkspace(page);
  const requests: unknown[] = [];
  await page.route("**/api/agents/bot-front-desk/workspace/toggle-tool", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        success: true,
        tool: emailCapability.tool,
        enable: true,
        enabledTools: requests.length === 1 ? [] : [emailCapability.tool],
      },
    });
  });

  await requestProposal(page);
  const review = page.getByRole("region", { name: "Review Email capability", exact: true });
  const save = review.getByRole("button", { name: "Save Email capability", exact: true });
  await expect(review.getByText(/Enable this capability/)).toBeVisible();
  expect(requests).toHaveLength(0);
  await save.click();
  await expect(review.getByRole("alert")).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(review.getByText("Saved", { exact: true })).toHaveCount(0);
  await save.click();
  await expect(review.getByText("Saved", { exact: true })).toBeVisible();
  expect(requests).toEqual([
    { tool: emailCapability.tool, enable: true },
    { tool: emailCapability.tool, enable: true },
  ]);
});

test("Configure drafts survive navigation and voice rehearsal without a second composer", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockWorkspace(page);
  const review = await requestProposal(page);
  const buildInput = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
  // Voice rehearsal stays beside the one conversation that changes the Bot.
  const panel = page.getByRole("complementary", { name: "Workspace panel" });
  await buildInput.fill("Keep this unsent Build instruction.");
  await page.getByRole("tab", { name: "Rehearse", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  // Rehearsal owns its single typed test composer; it must not duplicate the
  // conversation's "Message Front Desk" composer.
  await expect(panel.getByRole("textbox")).toHaveCount(1);
  await expect(panel.getByRole("textbox", { name: "Type a test", exact: true })).toBeVisible();
  await expect(buildInput).toHaveValue("Keep this unsent Build instruction.");
  await expect(panel.getByText(opening.value, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("studio-try-it-beside-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Open Inbox", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox\?tab=email&agent=bot-front-desk$/);
  await page.goBack();
  await expect(buildInput).toHaveValue("Keep this unsent Build instruction.");
  await expect(review).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(1);

  // Phones keep private rehearsal behind one contextual action.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("studio-try-it-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await expect(review).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
  await expect(buildInput).toHaveValue("Keep this unsent Build instruction.");
});

for (const section of ["Set Up", "Summary"] as const) {
  test(`${section} opens voice rehearsal without a second editor`, async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    const input = page.getByRole("textbox", {
      name: "Message Front Desk",
      exact: true,
    });
    await input.fill("Keep my configuration draft.");
    await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
    await page.getByRole("tab", { name: section, exact: true }).click();
    await page
      .getByRole("button", {
        name: "Try It",
        exact: true,
      })
      .click();
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeFocused();
    await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
    await expect(input).toHaveValue("Keep my configuration draft.");
    await expect(input).toHaveCSS("resize", "none");
  });
}

test("setup focuses voice without seeding a customer message or replacing the Set Up draft", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
  const buildInput = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
  await buildInput.fill("Keep this unsent Build instruction.");
  await expect(buildInput).toHaveCSS("resize", "none");
  await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
  const greeting = page.getByRole("textbox", { name: "Opening Greeting", exact: true });
  await expect(greeting).toBeVisible();
  expect(await greeting.evaluate((element) => getComputedStyle(element).resize)).toMatch(
    /^(block|vertical)$/,
  );
  await page.getByRole("button", { name: "Try It", exact: true }).click();
  const testInput = page.getByRole("textbox", {
    name: "Customer message for Front Desk",
    exact: true,
  });
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeFocused();
  await expect(testInput).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
  await expect(buildInput).toHaveValue("Keep this unsent Build instruction.");
});

test("Set Up proposals survive rehearsal and Bot switches without appearing on another Bot", async ({
  page,
}) => {
  const writes = await mockWorkspace(page);
  const review = await requestProposal(page);
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  await expect(review).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
  await expect(review.getByText(opening.value, { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption(bots[1].id);
  await expect(page.getByRole("textbox", { name: "Message Sales Bot", exact: true })).toBeVisible();
  await expect(review).toHaveCount(0);
  await expect(page.getByText(plan.reply, { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption(bots[0].id);
  await expect(review.getByText(opening.value, { exact: true })).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Save Opening greeting", exact: true }),
  ).toBeEnabled();
  expect(writes.filter((request) => request.path.endsWith("/apply-change"))).toHaveLength(0);
});

test("a delayed clear remains pending across remounts and cannot restore deleted proposals", async ({
  page,
}) => {
  await mockWorkspace(page);
  let deleteCount = 0;
  let releaseDelete!: () => void;
  const deleteReady = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  await page.route("**/api/agents/bot-front-desk/workspace/messages", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCount += 1;
      await deleteReady;
      await route.fulfill({ json: { cleared: true } });
    } else {
      await route.fulfill({ json: { messages: [] } });
    }
  });

  const review = await requestProposal(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear conversation", exact: true }).click();
  try {
    await expect.poll(() => deleteCount).toBe(1);
    await page.getByRole("link", { name: "Open Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox\?tab=email&agent=bot-front-desk$/);
    await expect(review).toHaveCount(0);
    await page.goBack();
    await expect(review).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear conversation", exact: true }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Open Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox\?tab=email&agent=bot-front-desk$/);
    await expect(review).toHaveCount(0);
  } finally {
    releaseDelete();
  }

  await page.goBack();
  await expect(review).toHaveCount(0);
  await expect(page.getByText(plan.reply, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear conversation", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Rehearse", exact: true }).click();
  await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByText(plan.reply, { exact: true })).toHaveCount(0);
  expect(deleteCount).toBe(1);
});

test("voice rehearsal has no typed endpoint or configuration submission", async ({ page }) => {
  const writes = await mockWorkspace(page);
  const typedRequests: string[] = [];
  await page.route("**/api/agents/*/test/stream", (route) => {
    typedRequests.push(route.request().url());
    return route.fulfill({ status: 500 });
  });
  await page.goto(`/studio?agent=${bots[0].id}&workroom=test`);
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Review Opening greeting" })).toHaveCount(0);
  expect(typedRequests).toEqual([]);
  await expect(page.getByRole("button", { name: "Save Opening greeting" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Review Email capability" })).toHaveCount(0);
  await expect(page.getByText(emailDraft.subject, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Inbox", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review Opening greeting" })).toHaveCount(0);
  expect(
    writes.filter((request) => /apply-change|toggle-tool|run-action|outbound/.test(request.path)),
  ).toHaveLength(0);
});

for (const width of [1280, 320]) {
  test(`proposal values and communication drafts fit at ${width}px and never offer an implicit send`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockWorkspace(page);
    await requestProposal(page);
    const response = page.getByRole("article", { name: "Front Desk response" });
    await expect(response.getByText(emailDraft.to, { exact: false })).toBeVisible();
    await expect(response.getByText(emailDraft.subject, { exact: false })).toBeVisible();
    await expect(response.getByText(emailDraft.body, { exact: true })).toBeVisible();
    const inbox = response.getByRole("link", { name: "Open Inbox", exact: true });
    await expect(inbox).toHaveAttribute("href", /^\/inbox(?:\?|$)/);
    await expect(response.getByRole("button", { name: /send|approve|call/i })).toHaveCount(0);
    await expectContentFits(response);
    expect(
      await response.evaluate((element) => element.scrollWidth <= element.clientWidth + 2),
    ).toBe(true);
    expect(
      writes.filter((request) => /run-action|outbound|emails\/send/.test(request.path)),
    ).toHaveLength(0);
    const viewportPath = testInfo.outputPath(`studio-proposals-${width}px.png`);
    await page.screenshot({ path: viewportPath, fullPage: true });
    await testInfo.attach(`Synthetic Studio proposal review at ${width}px`, {
      path: viewportPath,
      contentType: "image/png",
    });
    const proposalsPath = testInfo.outputPath(`studio-proposals-content-${width}px.png`);
    await response.screenshot({ path: proposalsPath });
    await testInfo.attach(`Complete synthetic proposal content at ${width}px`, {
      path: proposalsPath,
      contentType: "image/png",
    });
  });
}
