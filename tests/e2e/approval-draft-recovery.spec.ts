import { expect, test } from "@playwright/test";

test("approvals show a short draft first and keep the full action available", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/auth/session"
        ? { user: { id: "approvals-owner", email: "owner@example.test" } }
        : path === "/api/Assistants/tasks"
          ? {
              tasks: [
                {
                  id: "draft-task",
                  task_type: "send_email",
                  status: "pending",
                  payload: {
                    to: "customer@example.test",
                    subject: "Plan overview",
                    body: `Hi there,\n\nHere is the plan overview you requested. ${"The plan includes calls and email. ".repeat(8)}Final price requires review.`,
                  },
                },
                {
                  id: "calendar-task",
                  task_type: "schedule_calendar",
                  status: "pending",
                  description: "Calendar request: Product demo",
                  payload: {
                    event_name: "Product demo",
                    customer_name: "Taylor",
                    date: "2026-10-15",
                    time: "14:00",
                    timezone: "America/Chicago",
                  },
                },
              ],
            }
          : path === "/api/triage"
            ? {
                hot_leads: [],
                compliance: [],
                pending_tasks: [],
                knowledge_gaps: [],
                escalations: [],
              }
            : { accounts: [], agents: [], numbers: [], data: [] };
    await route.fulfill({ json });
  });
  await page.goto("/approvals");

  const draft = page.getByRole("article").filter({ hasText: "customer@example.test" });
  await expect(draft.locator("p").nth(1)).toContainText("Here is the plan overview you requested.");
  await expect(draft.locator("details p")).toBeHidden();
  await expect(draft.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await draft.getByText("Read details").focus();
  await page.keyboard.press("Enter");
  await expect(draft.locator("details p")).toContainText("Final price requires review.");
  await expect(draft.locator("details p")).toBeVisible();

  const calendar = page.getByRole("article").filter({ hasText: "Product demo" });
  await expect(calendar.locator("p").first()).toContainText("2026-10-15 · 14:00 · America/Chicago");
  await expect(calendar.locator("details p")).toContainText("Customer name: Taylor");
  await expect(calendar.locator("details p")).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

for (const refreshFails of [false, true]) {
  test(`approval drafts survive a sibling resolution and ${refreshFails ? "failed" : "successful"} refresh`, async ({
    page,
  }) => {
    const firstTask = {
      id: "draft-task",
      task_type: "send_email",
      status: "pending",
      payload: { to: "customer@example.test", subject: "Original subject", body: "Original body" },
    };
    const secondTask = {
      id: "other-task",
      task_type: "follow_up",
      status: "pending",
      description: "Separate manual follow-up",
    };
    let resolved = false;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/Assistants/tasks/other-task/approve") {
        resolved = true;
        await route.fulfill({ json: { success: true } });
        return;
      }
      if (path === "/api/Assistants/tasks") {
        if (resolved) await refreshGate;
        await route.fulfill(
          resolved && refreshFails
            ? { status: 503, json: { error: "Temporarily unavailable" } }
            : { json: { tasks: resolved ? [{ ...firstTask }] : [firstTask, secondTask] } },
        );
        return;
      }
      const json =
        path === "/api/auth/session"
          ? { user: { id: "approvals-owner", email: "owner@example.test" } }
          : path === "/api/triage"
            ? {
                hot_leads: [],
                compliance: [],
                pending_tasks: [],
                knowledge_gaps: [],
                escalations: [],
              }
            : { accounts: [], agents: [], numbers: [], data: [] };
      await route.fulfill({ json });
    });
    await page.goto("/approvals");
    const draftCard = page.getByRole("article").filter({ hasText: "customer@example.test" });
    await draftCard.getByRole("button", { name: "Edit", exact: true }).click();
    await draftCard.getByLabel("Subject", { exact: true }).fill("My unsaved subject");
    await draftCard
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("My unsaved message");
    try {
      await page
        .getByRole("article")
        .filter({ hasText: "Separate manual follow-up" })
        .getByRole("button", { name: "I handled this", exact: true })
        .click();
      await expect(page.getByText("Separate manual follow-up", { exact: true })).toHaveCount(0);
      await expect(draftCard.getByLabel("Subject", { exact: true })).toHaveValue(
        "My unsaved subject",
      );
      await expect(draftCard.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
        "My unsaved message",
      );
    } finally {
      releaseRefresh();
    }
    if (refreshFails)
      await expect(page.getByText("Actions Unavailable", { exact: true })).toBeVisible();
    else
      await expect(
        page.getByRole("button", { name: "Pending Actions (1)", exact: true }),
      ).toBeVisible();
    await expect(draftCard.getByLabel("Subject", { exact: true })).toHaveValue(
      "My unsaved subject",
    );
    await expect(draftCard.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
      "My unsaved message",
    );
  });
}

test("approvals let the owner call back, open the source, and fill a knowledge gap", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/auth/session"
        ? { user: { id: "approvals-owner", email: "owner@example.test" } }
        : path === "/api/Assistants/tasks"
          ? {
              tasks: [
                {
                  id: "call-follow-up",
                  task_type: "follow_up",
                  status: "pending",
                  description: "Quote request: Water heater install, wants a call after 5pm",
                  customer_info: { phone: "+15125550100" },
                  source_type: "phone_call",
                  source_id: "openai:call-1",
                },
                {
                  id: "email-handoff",
                  task_type: "human_handoff",
                  status: "pending",
                  description: "Review email conversation: Pricing question",
                  customer_info: { email: "lead@example.test" },
                  source_type: "email_thread",
                  source_id: "thread-42",
                },
              ],
            }
          : path === "/api/triage"
            ? {
                hot_leads: [],
                compliance: [],
                pending_tasks: [],
                knowledge_gaps: [
                  {
                    id: "7",
                    agent_id: "bot-1",
                    lesson: "[KNOWLEDGE GAP] Do you service tankless heaters?",
                  },
                ],
                escalations: [],
              }
            : { accounts: [], agents: [], numbers: [], data: [] };
    await route.fulfill({ json });
  });
  await page.goto("/approvals");

  const followUp = page.getByRole("article").filter({ hasText: "Water heater install" });
  await expect(followUp.getByRole("link", { name: /Call Back/ })).toHaveAttribute(
    "href",
    "tel:+15125550100",
  );
  await expect(followUp.getByRole("link", { name: "Open Calls" })).toHaveAttribute(
    "href",
    "/phone?tab=logs",
  );
  const handoff = page.getByRole("article").filter({ hasText: "Pricing question" });
  await expect(handoff.getByRole("link", { name: "Open Conversation" })).toHaveAttribute(
    "href",
    "/inbox?tab=email&thread=thread-42",
  );

  await page.getByRole("button", { name: /Gaps/ }).click();
  const gap = page.getByRole("article").filter({ hasText: "tankless" });
  await expect(gap).toContainText("Your Bot could not answer: Do you service tankless heaters?");
  await expect(gap).not.toContainText("[KNOWLEDGE GAP]");
  await expect(gap.getByRole("link", { name: "Add to Knowledge" })).toHaveAttribute(
    "href",
    "/knowledge?agent=bot-1",
  );
});
