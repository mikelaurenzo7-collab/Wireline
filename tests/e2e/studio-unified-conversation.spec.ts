import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * The Workspace's Set Up page works like a modern AI workbench: the
 * conversation that changes the Bot stays on the left, and a resizable panel
 * on the right opens the Browser and holds Rehearse, Set up, and Summary. The
 * panel drags wider, goes full width, and closes. Phones switch Conversation /
 * Browser in place, preserving both drafts without starting external work.
 */

const bots = [
  { id: "bot-front-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales Bot", role: "sales" },
];

function pastTask(id: string, agentId: string, goal: string, summary: string) {
  const now = new Date().toISOString();
  return {
    id,
    agentId,
    goal,
    summary,
    status: "completed",
    question: null,
    sources: [],
    events: [],
    turnCount: 1,
    actionCount: 1,
    startedAt: now,
    finishedAt: now,
    updatedAt: now,
    liveView: false,
  };
}

async function mockWorkspace(
  page: Page,
  tasks: Array<Record<string, unknown>> = [],
  frame?: Buffer,
) {
  const starts: Array<Record<string, unknown>> = [];
  const replies: Array<Record<string, unknown>> = [];
  const stops: string[] = [];
  // Every endpoint stays mocked: no account, database, browser, or provider traffic runs.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const request = route.request();
    if (path === "/api/computer/tasks" && request.method() === "POST") {
      const input = request.postDataJSON() as Record<string, unknown>;
      starts.push(input);
      const next = {
        id: `work-task-${starts.length}`,
        agentId: input.agentId,
        goal: input.goal || "Browse first.",
        startUrl: null,
        status: "running",
        summary: null,
        question: null,
        sources: [],
        events: [
          { at: new Date().toISOString(), kind: "action", text: "Reading the public directory." },
        ],
        turnCount: 1,
        actionCount: 1,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        updatedAt: new Date().toISOString(),
        liveView: true,
        currentUrl: "https://directory.example/",
        ownerControl: false,
        stopping: false,
      };
      tasks = [next, ...tasks];
      return route.fulfill({ status: 201, json: { task: next } });
    }
    const action = /^\/api\/computer\/tasks\/([^/]+)\/(reply|stop)$/.exec(path);
    if (action) {
      if (action[2] === "reply") replies.push(request.postDataJSON() as Record<string, unknown>);
      else stops.push(action[1]!);
      tasks = tasks.map((task) =>
        task.id === action[1]
          ? {
              ...task,
              ...(action[2] === "reply"
                ? { status: "running", question: null }
                : { stopping: true }),
            }
          : task,
      );
      return route.fulfill({ json: { task: tasks.find((task) => task.id === action[1]) } });
    }
    const oneTask = /^\/api\/computer\/tasks\/([^/]+)$/.exec(path);
    if (oneTask)
      return route.fulfill({ json: { task: tasks.find((task) => task.id === oneTask[1]) } });
    if (path.endsWith("/frame"))
      return frame &&
        tasks.some((task) => task.status === "running" || task.status === "needs_input")
        ? route.fulfill({ status: 200, contentType: "image/jpeg", body: frame })
        : route.fulfill({ status: 204, body: "" });
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
  return {
    starts,
    replies,
    stops,
    setTask: (id: string, patch: Record<string, unknown>) => {
      tasks = tasks.map((task) =>
        task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task,
      );
    },
    getTask: (id: string) => tasks.find((task) => task.id === id),
    addTask: (task: Record<string, unknown>) => {
      tasks = [task, ...tasks];
    },
  };
}

async function proof(page: Page, info: TestInfo, name: string) {
  const folder = process.env.BOTBOUND_WORKSPACE_PROOF_DIR;
  if (!folder) return;
  await mkdir(folder, { recursive: true });
  const path = join(folder, `synthetic-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const width of [390, 1440]) {
  test(`one conversation holds messages and computer work at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await mockWorkspace(page, [
      pastTask("prior-task", bots[0].id, "Research opening hours", "The office opens at nine."),
    ]);
    await page.route("**/api/agents/*/workspace/messages", (route) =>
      route.fulfill({
        json: {
          messages: [
            {
              id: "1",
              role: "agent",
              content: "I can help with your day.",
              createdAt: "2026-10-01T12:00:00Z",
            },
          ],
        },
      }),
    );
    await page.goto(`/studio?agent=${bots[0].id}`);
    const log = page.getByRole("log", { name: "Conversation", exact: true });
    await expect(log.getByText("I can help with your day.")).toBeVisible();
    await expect(log.getByText("The office opens at nine.")).toBeVisible();
    const message = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
    await message.fill("Keep my message draft.");
    await page.getByRole("button", { name: "Computer task", exact: true }).click();
    const task = page.getByRole("textbox", { name: "Task for Front Desk", exact: true });
    await task.fill("Find public opening hours.");
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(message).toHaveValue("Keep my message draft.");
    await page.getByRole("button", { name: "Computer task", exact: true }).click();
    await expect(task).toHaveValue("Find public opening hours.");
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect.poll(() => api.starts.length).toBe(1);
    if (width < 1180)
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Conversation", exact: true })
        .click();
    await expect(log.getByText("Find public opening hours.", { exact: true })).toBeVisible();
    await expect(log.getByText("I can help with your day.")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await proof(page, info, `unified-conversation-${width}`);
  });
}

test("memory persists per Bot and a failed save preserves the note", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  const notes: Record<string, Array<{ id: string; content: string }>> = {};
  let fail = false;
  await page.route("**/api/agents/*/workspace/memory**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/")[3]!;
    notes[id] ||= [];
    if (route.request().method() === "POST") {
      if (fail)
        return route.fulfill({ status: 503, json: { error: "Save could not be confirmed." } });
      notes[id].push({ id: "42", content: route.request().postDataJSON().content });
    }
    if (route.request().method() === "DELETE") notes[id] = [];
    return route.fulfill({ json: { memories: notes[id] } });
  });
  await page.goto(`/studio?agent=${bots[0].id}&section=details`);
  await page.getByText("Memory", { exact: true }).click();
  const input = page.getByRole("textbox", { name: "Remember this", exact: true });
  await expect(input).toBeVisible();
  await input.fill("Use Central time.");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByRole("button", { name: "Forget: Use Central time." })).toBeVisible();
  fail = true;
  await input.fill("Keep summaries brief.");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByRole("alert")).toContainText("Save could not be confirmed.");
  await expect(input).toHaveValue("Keep summaries brief.");
  await proof(page, info, "memory-recovery");
  await page
    .getByRole("navigation", { name: "Bot conversations" })
    .getByRole("link", { name: "Open Sales Bot conversation" })
    .click();
  await page.getByRole("button", { name: "Sales Bot details" }).click();
  await page.getByText("Memory", { exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByText("Use Central time.", { exact: true })).toHaveCount(0);
  await page.goto(`/studio?agent=${bots[0].id}&section=details`);
  await page.getByText("Memory", { exact: true }).click();
  await page.getByRole("button", { name: "Forget: Use Central time." }).click();
  await expect(page.getByText("No saved memories yet.", { exact: false })).toBeVisible();
});
