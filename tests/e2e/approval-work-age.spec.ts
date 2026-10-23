import { expect, test } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "UTC" });

test("old owner work keeps truthful creation context and unchanged actions at 320px enlarged text", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
  let taskMutations = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      taskMutations += 1;
      return route.fulfill({ status: 409, json: { error: "No action requested by this test" } });
    }
    const json =
      path === "/api/auth/session"
        ? { user: { id: "approval-age-owner", email: "owner@example.test" } }
        : path === "/api/Assistants/tasks"
          ? {
              tasks: [
                {
                  id: "old-owner-task",
                  task_type: "follow_up",
                  status: "pending",
                  description: "Review the historical service request before following up.",
                  created_at: "2026-09-20T12:00:00Z",
                },
                {
                  id: "old-executable-email",
                  task_type: "send_email",
                  status: "pending",
                  createdAt: "2026-10-09T12:00:00Z",
                  payload: {
                    to: "customer@example.test",
                    subject: "Requested overview",
                    body: "Reviewed email draft.",
                  },
                },
                {
                  id: "missing-creation",
                  task_type: "follow_up",
                  status: "pending",
                  description: "Review work with missing creation metadata.",
                },
                {
                  id: "invalid-creation",
                  task_type: "follow_up",
                  status: "pending",
                  description: "Review work with invalid creation metadata.",
                  created_at: "not a date",
                },
                {
                  id: "future-creation",
                  task_type: "follow_up",
                  status: "pending",
                  description: "Review work with a future recorded creation time.",
                  created_at: "2026-10-24T12:00:00Z",
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
    return route.fulfill({ json });
  });
  await page.goto("/approvals");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  const manual = page.getByRole("article").filter({ hasText: "historical service request" });
  await expect(manual.locator("time")).toHaveAttribute("datetime", "2026-09-20T12:00:00.000Z");
  await expect(manual.locator("time")).toContainText("Sep 20, 2026");
  await expect(manual).toContainText("33 days ago");
  await expect(manual).toContainText("Manual task");
  await expect(manual.getByRole("button", { name: "I handled this", exact: true })).toBeEnabled();
  await expect(manual.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  const email = page.getByRole("article").filter({ hasText: "customer@example.test" });
  await expect(email.locator("time")).toHaveAttribute("datetime", "2026-10-09T12:00:00.000Z");
  await expect(email).toContainText("14 days ago");
  await expect(email.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await expect(email.getByText("Manual task", { exact: true })).toHaveCount(0);

  for (const description of ["missing creation metadata", "invalid creation metadata"]) {
    const card = page.getByRole("article").filter({ hasText: description });
    await expect(card).toContainText("Creation time unavailable");
    await expect(card.locator("time")).toHaveCount(0);
  }
  const future = page.getByRole("article").filter({ hasText: "future recorded creation time" });
  await expect(future.locator("time")).toHaveAttribute("datetime", "2026-10-24T12:00:00.000Z");
  await expect(future).toContainText("Future timestamp");
  await expect(future.getByText(/ago/)).toHaveCount(0);

  const geometry = await page.locator("[data-owner-work-created]").evaluateAll((rows) =>
    rows.map((row) => {
      const card = row.closest("article")!.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(row);
      return {
        withinCard: bounds.left >= card.left && bounds.right <= card.right,
        textFits: Array.from(range.getClientRects()).every(
          (line) => line.left >= card.left - 1 && line.right <= card.right + 1,
        ),
        noInnerOverflow: row.scrollWidth <= row.clientWidth + 1,
      };
    }),
  );
  expect(geometry).toHaveLength(5);
  expect(geometry.every((row) => row.withinCard && row.textFits && row.noInnerOverflow)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await manual.locator("[data-owner-work-created]").scrollIntoViewIfNeeded();
  await expect(manual.locator("time")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("approval-work-age-320-enlarged.png") });
  expect(taskMutations).toBe(0);
});
