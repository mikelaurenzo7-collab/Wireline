import { openSavedChat } from "./helpers/studio-chat-history";
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
    await page.route("**/api/agents/*/workspace/messages?thread=*", (route) =>
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
    await expect(log.getByText("I can help with your day.")).toHaveCount(0);
    await expect(log.getByText("The office opens at nine.")).toHaveCount(0);
    await openSavedChat(page);
    await expect(log.getByText("I can help with your day.")).toBeVisible();

    await expect(log.getByText("The office opens at nine.")).toBeVisible();
    const message = page.getByRole("textbox", { name: "Message Front Desk", exact: true });
    const inputNode = await message.elementHandle();
    await expect(page.getByRole("group", { name: "Conversation mode" })).toHaveCount(0);
    await expect(page.locator(".wl-studio-chat__composer textarea")).toHaveCount(1);
    await message.fill("Keep my message draft.");
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(log.getByText("The office opens at nine.")).toBeVisible();
    const task = page.getByRole("textbox", { name: "Task for Front Desk", exact: true });
    expect(await inputNode!.evaluate((node) => node.isConnected)).toBe(true);
    await task.fill("Find public opening hours.");
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(message).toHaveValue("Keep my message draft.");
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(task).toHaveValue("Find public opening hours.");
    let acceptStart: () => void = () => undefined;
    const startGate = new Promise<void>((resolve) => {
      acceptStart = resolve;
    });
    await page.route("**/api/computer/tasks", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await startGate;
      return route.fallback();
    });
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect(task).toBeEnabled();
    await task.fill("Keep my next browser request.");
    acceptStart();
    await expect.poll(() => api.starts.length).toBe(1);
    expect(api.starts[0]).toEqual({ agentId: bots[0].id, goal: "Find public opening hours." });
    await expect(task).toHaveValue("Keep my next browser request.");
    if (width < 1180) {
      await expect(task).toBeVisible();
      await expect(page.getByRole("button", { name: "View browser", exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(message).toHaveValue("Keep my message draft.");
    api.setTask("work-task-1", { status: "needs_input", question: "Which city should I search?" });
    await expect(log.getByText("Which city should I search?", { exact: true })).toBeVisible();
    await expect(message).toHaveValue("Keep my message draft.");
    await log.getByRole("button", { name: "Reply to task", exact: true }).click();
    const answer = page.getByRole("textbox", { name: "Reply to Front Desk", exact: true });
    expect(await inputNode!.evaluate((node) => node.isConnected)).toBe(true);
    await answer.fill("Chicago");
    await page.getByRole("button", { name: "Reply to Bot", exact: true }).click();
    await expect.poll(() => api.replies).toEqual([{ message: "Chicago" }]);
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(message).toHaveValue("Keep my message draft.");
    await page.getByRole("button", { name: "Stop task", exact: true }).click();
    await expect.poll(() => api.stops).toEqual(["work-task-1"]);
    expect(api.starts).toHaveLength(1);
    await expect(page.locator(".wl-studio-chat__composer textarea")).toHaveCount(1);
    await expect(log.getByText("Find public opening hours.", { exact: true })).toBeVisible();
    await expect(log.getByText("I can help with your day.")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await proof(page, info, `unified-conversation-${width}`);
  });
}

test("About You lists each Bot's private notes in Knowledge and a failed forget keeps them", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  const notes: Record<string, Array<{ id: string; content: string }>> = {
    [bots[0].id]: [{ id: "42", content: "Use Central time." }],
  };
  let fail = true;
  await page.route("**/api/agents/*/workspace/memory**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/")[3]!;
    notes[id] ||= [];
    // About You never adds a note: the chat or hands-free does.
    expect(route.request().method()).not.toBe("POST");
    if (route.request().method() === "DELETE") {
      if (fail)
        return route.fulfill({ status: 503, json: { error: "Change could not be confirmed." } });
      notes[id] = [];
    }
    return route.fulfill({ json: { memories: notes[id] } });
  });
  await page.goto(`/knowledge?agent=${bots[0].id}`);
  const about = page.getByRole("region", { name: "About You" });
  await expect(about.getByText("Use Central time.", { exact: true })).toBeVisible();
  await expect(about.getByRole("textbox")).toHaveCount(0);
  await about.getByRole("button", { name: "Forget: Use Central time." }).click();
  await expect(about.getByRole("alert")).toContainText("Change could not be confirmed.");
  await expect(about.getByText("Use Central time.", { exact: true })).toBeVisible();
  await proof(page, info, "about-you-recovery");
  await page.goto(`/knowledge?agent=${bots[1].id}`);
  await expect(page.getByText("Use Central time.", { exact: true })).toHaveCount(0);
  fail = false;
  await page.goto(`/knowledge?agent=${bots[0].id}`);
  await about.getByRole("button", { name: "Forget: Use Central time." }).click();
  await expect(about.getByText("Nothing saved yet.", { exact: true })).toBeVisible();
});

test("New chat preserves earlier threads and their projects across a reload", async ({ page }) => {
  await mockWorkspace(page, []);
  const chats = new Map<string, { title: string; project: string | null }>();
  await page.route("**/workspace/messages/stream?thread=*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("thread")!;
    const title = route.request().postDataJSON().content;
    if (!chats.has(id)) chats.set(id, { title, project: null });
    await route.fulfill({
      contentType: "text/event-stream",
      body: 'event: done\ndata: {"reply":"Saved","messageId":"42"}\n\n',
    });
  });
  await page.route("**/workspace/messages?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("view") === "history") {
      await route.fulfill({
        json: { threads: Array.from(chats, ([id, chat]) => ({ id, ...chat })), nextCursor: null },
      });
      return;
    }
    const chat = chats.get(url.searchParams.get("thread")!);
    if (!chat) return route.fulfill({ status: 404, json: {} });
    if (route.request().method() === "PATCH") {
      chat.project = route.request().postDataJSON().project;
      return route.fulfill({ json: { project: chat.project } });
    }
    await route.fulfill({
      json: {
        messages: [
          {
            id: "41",
            role: "Account Holder",
            content: chat.title,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.goto(`/studio?agent=${bots[0].id}`);
  const log = page.getByRole("log", { name: "Conversation", exact: true });
  const input = page.getByRole("textbox", { name: "Message Front Desk" });
  for (const title of ["Morning schedule", "Afternoon agenda"]) {
    await input.fill(title);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(log.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await expect(log.getByText(title)).toHaveCount(0);
  }
  expect(chats.size).toBe(2);
  await page.reload();
  await expect(log.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Chat history" }).click();
  const history = page.getByRole("dialog", { name: "Chat history" });
  await history.getByRole("button", { name: "Move Morning schedule to project" }).click();
  await history.getByLabel("Project name").fill("Appointments");
  await history.getByRole("button", { name: "Save", exact: true }).click();
  await expect(history.getByRole("heading", { name: "Appointments" })).toBeVisible();
  await history.getByRole("button", { name: "Morning schedule", exact: true }).click();
  await expect(log.getByText("Morning schedule")).toBeVisible();
  await expect(log.getByText("Afternoon agenda")).toHaveCount(0);
});
