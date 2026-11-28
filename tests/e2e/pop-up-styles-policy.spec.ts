import { expect, test, type Page } from "@playwright/test";

/**
 * The command palette's list is a scroll area, which renders one fixed
 * <style> to hide its native scrollbar. The security policy allows an inline
 * style by hash only. Until that hash was listed, the browser refused the
 * style each time the palette opened and logged a policy violation.
 */

const bot = { id: "bot-front-desk", name: "Front Desk", role: "receptionist" };

// Every endpoint stays mocked: no account, database, or provider traffic runs.
async function mockWorkspace(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
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
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "palette-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: [bot] }
            : path.startsWith("/api/agent-config/")
              ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
              : path === "/api/computer/status"
                ? { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 60 } }
                : path === "/api/computer/tasks"
                  ? { tasks: [] }
                  : {
                      accounts: [],
                      data: [],
                      numbers: [],
                      integrations: [],
                      messages: [],
                      threads: [],
                    },
    });
  });
}

test("the command palette opens without a refused style", async ({ page }) => {
  const refused: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      refused.push(message.text().slice(0, 160));
    }
  });
  await mockWorkspace(page);
  await page.goto(`/studio?agent=${bot.id}`);
  await expect(page.getByRole("textbox", { name: "Message Front Desk" })).toBeVisible();

  await page.getByRole("button", { name: "Open command palette" }).click();
  const search = page.getByRole("combobox", { name: "Search commands" });
  await expect(search).toBeVisible();
  const viewport = page.locator("[data-radix-scroll-area-viewport]");
  await expect(viewport).toBeVisible();
  // The rule that was refused is the one that hides this scrollbar.
  await expect
    .poll(() => viewport.evaluate((node) => getComputedStyle(node).scrollbarWidth))
    .toBe("none");
  expect(refused).toEqual([]);
});
