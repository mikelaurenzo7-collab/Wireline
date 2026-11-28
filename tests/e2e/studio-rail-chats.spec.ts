import { expect, test, type Page } from "@playwright/test";

/**
 * The workspace rail lists the selected Bot's chats. Its links carry
 * `?conversation=`, which Studio applies and then removes from the address.
 *
 * New chat used to end on the "Something broke" screen (React error 185). The
 * router's removal of `?conversation=new` waited behind Studio's own updates,
 * so Studio kept seeing the request, and `new` never equals the open chat:
 * each pass opened another fresh chat and rebuilt the conversation until React
 * stopped the loop.
 */

const bot = { id: "bot-front-desk", name: "Front Desk", role: "receptionist" };
const saved = "3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c";

// Every endpoint stays mocked: no account, database, or provider traffic runs.
async function mockStudio(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/billing/status") {
      await route.fulfill({
        json: {
          email_verified: true,
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
    if (path.endsWith("/workspace/messages")) {
      await route.fulfill({
        json:
          url.searchParams.get("view") === "history"
            ? {
                threads: [{ id: saved, title: "Morning schedule", project: null }],
                nextCursor: null,
              }
            : {
                messages: [
                  {
                    id: "41",
                    role: "Account Holder",
                    content: "Morning schedule",
                    createdAt: new Date().toISOString(),
                  },
                ],
                nextCursor: null,
              },
      });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "rail-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: [bot] }
            : path.startsWith("/api/agent-config/")
              ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
              : path === "/api/computer/status"
                ? { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 60 } }
                : path === "/api/computer/tasks"
                  ? { tasks: [] }
                  : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
}

test("the rail opens a saved chat and a fresh chat, and Studio stays up", async ({ page }) => {
  // Tall enough that the rail shows its chats above the navigation groups.
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockStudio(page);
  await page.goto(`/studio?agent=${bot.id}`);

  const rail = page.getByRole("navigation", { name: "Chats", exact: true });
  const savedLink = rail.getByRole("link", { name: "Morning schedule", exact: true });
  const newChat = rail.getByRole("link", { name: "New chat", exact: true });
  const log = page.getByRole("log", { name: "Conversation", exact: true });
  const input = page.getByRole("textbox", { name: "Message Front Desk" });

  await savedLink.click();
  await expect(log.getByText("Morning schedule")).toBeVisible();
  await expect(page).not.toHaveURL(/conversation=/);
  await expect(savedLink).toHaveAttribute("aria-current", "page");

  // Twice: the link still works after the first press has been applied.
  for (let press = 0; press < 2; press += 1) {
    await newChat.click();
    await expect(page).not.toHaveURL(/conversation=/);
    await expect(log.getByText("Morning schedule")).toHaveCount(0);
    await expect(input).toBeVisible();
    await expect(page.getByText("Something broke")).toHaveCount(0);
    await expect(savedLink).not.toHaveAttribute("aria-current", "page");
  }

  // A draft is kept unless the owner agrees to leave it.
  await input.fill("Half-written note");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await newChat.click();
  await expect(page).not.toHaveURL(/conversation=/);
  await expect(input).toHaveValue("Half-written note");
  await expect(page.getByText("Something broke")).toHaveCount(0);
});

test("a link that asks for a fresh chat opens Studio once", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockStudio(page);
  await page.goto(`/studio?agent=${bot.id}&conversation=new`);

  await expect(page).not.toHaveURL(/conversation=/);
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).toBeVisible();
  await expect(page.getByText("Something broke")).toHaveCount(0);
});
