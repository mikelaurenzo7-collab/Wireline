import { expect, test, type Page } from "@playwright/test";

const THREAD_ID = "5f0c9a2e-3d4b-4c1a-9f8e-2b7d6c5a4e31";
const thread = {
  id: THREAD_ID,
  subject: "Quote for the kitchen",
  customer_email: "Dana Reyes <dana@example.com>",
  summary: "Can you come out Tuesday?",
  last_message_at: "2026-10-09T15:00:00Z",
  status: "open",
};

async function mockInbox(page: Page, reply: (body: Record<string, unknown>) => object | number) {
  const replies: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/emails/threads/${THREAD_ID}/reply`) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      replies.push(body);
      const outcome = reply(body);
      if (typeof outcome === "number") {
        await route.fulfill({
          status: outcome,
          json: {
            error: "The mailbox didn't accept this reply. Check it in Connections, then try again.",
            code: "EMAIL_REPLY_NOT_SENT",
          },
        });
      } else {
        await route.fulfill({ json: outcome });
      }
      return;
    }
    const json =
      url.pathname === "/api/auth/session"
        ? { user: { id: "inbox-owner", email: "owner@example.test" } }
        : url.pathname === "/api/billing/status"
          ? {
              channel_entitlements: {
                plan_id: "omnichannel",
                subscription_status: "active",
                channels: ["voice", "email", "sms"],
                is_owner: true,
              },
            }
          : url.pathname === "/api/agents"
            ? { agents: [{ id: "bot-desk", name: "Front Desk", role: "receptionist" }] }
            : url.pathname === "/api/emails/accounts"
              ? {
                  accounts: [
                    {
                      id: "mail-desk",
                      emailAddress: "desk@example.test",
                      provider: "agentmail",
                      agentId: "bot-desk",
                    },
                  ],
                }
              : url.pathname === "/api/emails/threads"
                ? { threads: [thread], hasMore: false, nextCursor: null }
                : url.pathname === `/api/emails/threads/${THREAD_ID}/outcome`
                  ? {
                      thread,
                      messages: [
                        {
                          id: "1",
                          role: "user",
                          content: "Can you come out Tuesday?",
                          created_at: "2026-10-09T15:00:00Z",
                        },
                      ],
                      handoff: null,
                    }
                  : { accounts: [], data: [], numbers: [], integrations: [], threads: [] };
    await route.fulfill({ json });
  });
  return replies;
}

async function openConversation(page: Page) {
  await page.goto("/inbox");
  await page
    .getByRole("button", { name: /Quote for the kitchen/ })
    .first()
    .click();
  await expect(page.getByText("Can you come out Tuesday?").last()).toBeVisible();
}

test("an owner replies from the conversation and sees it in the thread", async ({ page }) => {
  const replies = await mockInbox(page, (body) => ({
    status: "sent",
    duplicate: false,
    threaded: true,
    message: {
      id: "2",
      role: "owner",
      content: body.body,
      created_at: "2026-10-09T15:05:00Z",
    },
  }));
  await openConversation(page);

  const composer = page.getByRole("form", { name: "Reply to this conversation" });
  await expect(composer).toContainText("Reply to Dana Reyes <dana@example.com>");
  const send = composer.getByRole("button", { name: "Send Reply", exact: true });
  await expect(send).toBeDisabled();

  await composer.getByRole("textbox").fill("Tuesday at 10 works. See you then.");
  await send.click();

  await expect(page.locator('[data-author="assistant"]').filter({ hasText: "You" })).toContainText(
    "Tuesday at 10 works. See you then.",
  );
  await expect(composer.getByRole("textbox")).toHaveValue("");
  expect(replies).toHaveLength(1);
  expect(replies[0]).toMatchObject({ body: "Tuesday at 10 works. See you then." });
  expect(String(replies[0].operation_key)).toMatch(/^[0-9a-f-]{36}$/);
});

test("a refused reply keeps the text and retries under the same key", async ({ page }) => {
  let attempts = 0;
  const replies = await mockInbox(page, (body) =>
    ++attempts === 1
      ? 502
      : {
          status: "sent",
          duplicate: false,
          threaded: false,
          message: {
            id: "3",
            role: "owner",
            content: body.body,
            created_at: "2026-10-09T15:06:00Z",
          },
        },
  );
  await openConversation(page);

  const composer = page.getByRole("form", { name: "Reply to this conversation" });
  await composer.getByRole("textbox").fill("We'll be there Tuesday.");
  await composer.getByRole("button", { name: "Send Reply", exact: true }).click();

  await expect(composer.getByText("Reply Not Sent", { exact: true })).toBeVisible();
  await expect(composer.getByRole("textbox")).toHaveValue("We'll be there Tuesday.");

  await composer.getByRole("button", { name: "Send Reply", exact: true }).click();
  await expect(composer.getByText(/Sent with “Re:” in the subject/)).toBeVisible();
  expect(replies).toHaveLength(2);
  expect(replies[1].operation_key).toBe(replies[0].operation_key);
});
