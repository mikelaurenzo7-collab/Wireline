import { expect, test } from "@playwright/test";

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
        .getByRole("button", { name: "Complete", exact: true })
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
