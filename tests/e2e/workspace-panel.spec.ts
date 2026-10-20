import { expect, test, type Page } from "@playwright/test";

/**
 * The Workspace's Set Up page works like a modern AI workbench: the
 * conversation that changes the Bot stays on the left, and a resizable panel
 * on the right holds Try It, the Bot's computer, Details, and Summary. The
 * panel drags wider, goes full width, and closes, and phones keep the computer
 * as a Workspace section instead of a cramped panel.
 */

const bots = [
  { id: "bot-front-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales Bot", role: "sales" },
];

async function mockWorkspace(page: Page, tasks: Array<Record<string, unknown>> = []) {
  // Every endpoint stays mocked: no account, database, browser, or provider traffic runs.
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
          ? { user: { id: "panel-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: bots }
            : path.startsWith("/api/agent-config/")
              ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
              : path === "/api/computer/status"
                ? { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 60 } }
                : path === "/api/computer/tasks"
                  ? { tasks }
                  : { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
}

const panelTabs = (page: Page) => page.getByRole("tablist", { name: "Set Up panel" });
const panelTab = (page: Page, name: string) =>
  panelTabs(page).getByRole("tab", { name, exact: true });
const conversation = (page: Page, botName = "Front Desk") =>
  page.getByRole("textbox", { name: `Message ${botName}`, exact: true });

test.describe("wide screens", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("navigation starts compact, labels icons, and remembers expansion", async ({
    page,
  }, testInfo) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);

    const rail = page.getByRole("complementary", { name: "Workspace navigation", exact: true });
    const expand = rail.getByRole("button", { name: "Expand navigation", exact: true });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    expect((await rail.boundingBox())!.width).toBeLessThan(80);

    const calendar = rail.getByRole("link", { name: "Calendar", exact: true });
    await calendar.hover();
    await expect(page.getByRole("tooltip", { name: "Calendar", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace-compact-navigation.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const connections = rail.getByRole("link", { name: "Connections", exact: true });
    await connections.focus();
    await expect(page.getByRole("tooltip", { name: "Connections", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/connections$/);
    await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();

    await expand.click();
    await expect(
      rail.getByRole("button", { name: "Collapse navigation", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    expect((await rail.boundingBox())!.width).toBeGreaterThan(200);
    await page.reload();
    await expect(
      rail.getByRole("button", { name: "Collapse navigation", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("Set Up rests on Try It beside the conversation and opens the Bot's computer", async ({
    page,
  }, testInfo) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);

    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(panelTabs(page).getByRole("tab")).toHaveText([
      "Try It",
      "Computer",
      "Details",
      "Summary",
    ]);
    await expect(panelTab(page, "Try It")).toHaveAttribute("aria-selected", "true");

    // Changing the Bot and trying it are on screen together.
    await expect(conversation(page)).toBeVisible();
    const panel = page.getByRole("complementary", { name: "Set Up panel" });
    await panel.getByRole("button", { name: "Text", exact: true }).click();
    await expect(
      panel.getByRole("textbox", { name: "Customer message for Front Desk", exact: true }),
    ).toBeVisible();
    await expect(conversation(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace-try-it.png") });

    await panelTab(page, "Computer").click();
    await expect(panelTab(page, "Computer")).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByLabel("What should your Bot do?")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
    // The panel's computer belongs to the Bot being set up; no second Bot picker.
    await expect(panel.locator("#computer-agent")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "History", exact: true })).toBeVisible();
    await expect(conversation(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace-computer-panel.png") });

    // Full width takes the Workspace and gives it back without losing a draft.
    await conversation(page).fill("Keep this unsent instruction.");
    const fullWidth = page.getByRole("button", { name: "Full width", exact: true });
    await fullWidth.click();
    await expect(fullWidth).toHaveAttribute("aria-pressed", "true");
    await expect(conversation(page)).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize Set Up panel" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("workspace-computer-full-width.png") });
    await fullWidth.click();
    await expect(fullWidth).toHaveAttribute("aria-pressed", "false");
    await expect(conversation(page)).toHaveValue("Keep this unsent instruction.");

    // The panel returns to the last tab the owner used.
    await page.reload();
    await expect(panelTab(page, "Computer")).toHaveAttribute("aria-selected", "true", {
      timeout: 20_000,
    });

    // Close hands the whole width to the conversation, with its own Try It switch.
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(panelTabs(page)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Set Up view" })).toBeVisible();
    await page.getByRole("button", { name: "Bot details", exact: true }).click();
    await expect(panelTab(page, "Details")).toHaveAttribute("aria-selected", "true");
  });

  test("dragging widens the panel but never squeezes the conversation", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    const separator = page.getByRole("separator", { name: "Resize Set Up panel" });
    await expect(separator).toBeVisible({ timeout: 20_000 });
    const panel = page.getByRole("complementary", { name: "Set Up panel" });
    const before = (await panel.boundingBox())!.width;

    await separator.focus();
    await page.keyboard.press("End");
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 100);
    const composer = (await conversation(page).boundingBox())!;
    expect(composer.width).toBeGreaterThanOrEqual(300);

    await page.keyboard.press("Home");
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThan(before);
  });

  test("Computer drafts survive panel and responsive remounts without crossing Bots", async ({
    page,
  }) => {
    await mockWorkspace(page, [
      {
        id: "completed-task",
        agentId: bots[0].id,
        goal: "Read the previous page.",
        startUrl: null,
        status: "completed",
        summary: "The previous task is complete.",
        question: null,
        sources: [],
        events: [],
        turnCount: 1,
        actionCount: 1,
        startedAt: "2026-10-20T10:00:00Z",
        finishedAt: "2026-10-20T10:01:00Z",
        updatedAt: "2026-10-20T10:01:00Z",
        liveView: false,
      },
    ]);
    let taskStarts = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/computer/tasks" && request.method() === "POST")
        taskStarts += 1;
    });
    await page.goto(`/studio?agent=${bots[0].id}`);
    await panelTab(page, "Computer").click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const goal = page.getByLabel("What should your Bot do?", { exact: true });
    const url = page.getByLabel("Web address", { exact: true });
    await goal.fill("Read the public Calls Regular monthly price.");
    await url.fill("https://botbound.app/pricing");

    await panelTab(page, "Summary").click();
    await panelTab(page, "Computer").click();
    await expect(goal).toHaveValue("Read the public Calls Regular monthly price.");
    await expect(url).toHaveValue("https://botbound.app/pricing");
    await expect(page.getByRole("button", { name: "Back to task", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("link", { name: "Computer", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/computer\\?agent=${bots[0].id}$`));
    await expect(goal).toHaveValue("Read the public Calls Regular monthly price.");
    await expect(url).toHaveValue("https://botbound.app/pricing");
    await page.getByLabel("Bot", { exact: true }).selectOption(bots[1].id);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await expect(goal).toHaveValue("");
    await expect(url).toHaveValue("");
    await page.getByLabel("Bot", { exact: true }).selectOption(bots[0].id);
    await expect(goal).toHaveValue("Read the public Calls Regular monthly price.");
    await expect(url).toHaveValue("https://botbound.app/pricing");

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panelTab(page, "Computer")).toHaveAttribute("aria-selected", "true");
    await expect(goal).toHaveValue("Read the public Calls Regular monthly price.");
    await expect(url).toHaveValue("https://botbound.app/pricing");
    expect(taskStarts).toBe(0);
  });

  test("the Computer section opens beside the conversation, which stays visible", async ({
    page,
  }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[1].id}`);
    await conversation(page, "Sales Bot").fill("Keep this while the computer opens.");
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("link", { name: "Computer", exact: true })
      .click({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/studio\\?agent=${bots[1].id}$`));
    await expect(panelTab(page, "Computer")).toHaveAttribute("aria-selected", "true");
    await expect(conversation(page, "Sales Bot")).toHaveValue(
      "Keep this while the computer opens.",
    );
  });

  test("Computer links open beside the conversation on wide screens", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/computer?agent=${bots[1].id}`);
    await expect(page).toHaveURL(new RegExp(`/studio\\?agent=${bots[1].id}$`), {
      timeout: 20_000,
    });
    await expect(panelTab(page, "Computer")).toHaveAttribute("aria-selected", "true", {
      timeout: 20_000,
    });
    await expect(conversation(page, "Sales Bot")).toBeVisible();
  });

  test("a Try It link brings rehearsal forward over the computer", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    await panelTab(page, "Computer").click();
    await page.goto(`/studio?agent=${bots[0].id}&workroom=test`);
    await expect(panelTab(page, "Try It")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keep the computer as a Workspace section instead of a cramped panel", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    await expect(page.getByRole("group", { name: "Set Up view" })).toBeVisible();
    await expect(panelTabs(page)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);

    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("link", { name: "Computer", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/computer\\?agent=${bots[0].id}$`));
    await expect(page.getByLabel("What should your Bot do?")).toBeVisible();
  });
});
