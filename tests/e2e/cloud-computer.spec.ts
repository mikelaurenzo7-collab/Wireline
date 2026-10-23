import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { OWNER_BROWSER_CAPABILITIES } from "../../src/lib/cloud-computer/browser-capabilities";

// Computer is its own page below 1180px. Wider screens open it beside the Set Up
// conversation instead (workspace-panel.spec.ts), sharing this same workbench.
test.use({ viewport: { width: 1024, height: 800 } });

type MockTask = Record<string, unknown> & { id: string; status: string };

const NOW = new Date().toISOString();

function task(overrides: Partial<MockTask> & { id: string; status: string }): MockTask {
  return {
    agentId: "design-bot",
    goal: "Find three plumbers near Austin with Saturday hours and list their phone numbers.",
    startUrl: null,
    summary: null,
    question: null,
    sources: [],
    events: [],
    errorCode: null,
    turnCount: 3,
    actionCount: 7,
    startedAt: NOW,
    finishedAt: null,
    updatedAt: NOW,
    liveView: true,
    currentUrl: "https://austinplumbers.example/",
    ownerControl: false,
    controlRequested: false,
    stopping: false,
    ...overrides,
  };
}

async function fakeFrame(page: Page): Promise<Buffer> {
  // A real JPEG of a plain web page stands in for the remote browser frame.
  const frame = await page.context().newPage();
  await frame.setViewportSize({ width: 1280, height: 800 });
  await frame.setContent(
    `<body style="margin:0;font:16px system-ui;background:#fff;color:#111">
      <header style="padding:18px 32px;border-bottom:1px solid #ddd;font-weight:700">Austin Plumbing Directory</header>
      <main style="padding:32px"><h1 style="margin:0 0 16px">Plumbers open Saturday</h1>
      <p>Lone Star Plumbing · (512) 555-0142 · Sat 8am–4pm</p>
      <p>Barton Creek Pipe Co. · (512) 555-0177 · Sat 9am–2pm</p></main></body>`,
  );
  const jpeg = await frame.screenshot({ type: "jpeg", quality: 70 });
  await frame.close();
  return jpeg;
}

const ACTIVE = new Set(["running", "needs_input"]);

async function mockComputer(
  page: Page,
  options: {
    status: Record<string, unknown>;
    tasks: MockTask[];
    agents?: Array<{ id: string; name: string }>;
    frame?: Buffer | null;
    clickNavigatesTo?: string;
    ownerInputDelayMs?: number;
    /** Keep status and task-list reads unavailable until the test releases them. */
    failFirstLoad?: boolean;
  },
) {
  const replies: string[] = [];
  const stops: string[] = [];
  const ownerInputs: unknown[] = [];
  const takeovers: string[] = [];
  const returns: string[] = [];
  const starts: unknown[] = [];
  let listReads = 0;
  let tasks = options.tasks;
  let frame = options.frame;
  let recoverLoad = false;
  const setTask = (id: string, patch: Partial<MockTask>) => {
    tasks = tasks.map((item) => (item.id === id ? { ...item, ...patch } : item));
  };
  // Isolated UI fixtures: no live account, database, browser, or model calls.
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "design-owner", email: "owner@example.test" } } });
    }
    if (path === "/api/agents") {
      return route.fulfill({
        json: {
          agents: (options.agents ?? [{ id: "design-bot", name: "Front Desk" }]).map((agent) => ({
            ...agent,
            role: "receptionist",
            mark_key: "spark-rose",
            phone_number: "+15125550100",
          })),
        },
      });
    }
    if (path === "/api/billing/status") {
      return route.fulfill({
        json: {
          email_verified: true,
          channel_entitlements: {
            plan_id: "omnichannel",
            subscription_status: "active",
            channels: ["voice", "email", "sms"],
            is_owner: true,
          },
        },
      });
    }
    if (path === "/api/computer/status") {
      return options.failFirstLoad && !recoverLoad
        ? route.fulfill({ status: 500, json: { error: "Something went wrong." } })
        : route.fulfill({ json: options.status });
    }
    if (path === "/api/computer/tasks" && request.method() === "GET") {
      listReads += 1;
      return options.failFirstLoad && !recoverLoad
        ? route.fulfill({ status: 500, json: { error: "Something went wrong." } })
        : route.fulfill({ json: { tasks } });
    }
    if (path === "/api/computer/tasks" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        agentId: string;
        prepareBrowser?: boolean;
        goal?: string;
        startUrl?: string;
      };
      starts.push(body);
      const initialUrl = body.startUrl
        ? new URL(
            body.startUrl.includes("://") ? body.startUrl : `https://${body.startUrl}`,
          ).toString()
        : null;
      const next = task({
        id: "task-new",
        agentId: body.agentId,
        goal: body.prepareBrowser ? "Browse first, then give your Bot a task." : (body.goal ?? ""),
        startUrl: initialUrl,
        status: body.prepareBrowser ? "needs_input" : "running",
        question: body.prepareBrowser
          ? "Browse the web, then tell your Bot what to do from this browser."
          : null,
        currentUrl: initialUrl,
        frameUrl: initialUrl,
        frameCapturedAt: NOW,
        preparingBrowser: Boolean(body.prepareBrowser),
        ownerControl: Boolean(body.prepareBrowser),
        actionCount: 0,
      });
      tasks = [next, ...tasks];
      return route.fulfill({ status: 201, json: { task: next } });
    }
    const frameMatch = /^\/api\/computer\/tasks\/([^/]+)\/frame$/.exec(path);
    if (frameMatch) {
      // Like the server: a finished task's screen is gone.
      const live = ACTIVE.has(tasks.find((item) => item.id === frameMatch[1])?.status ?? "");
      return frame && live
        ? route.fulfill({ status: 200, contentType: "image/jpeg", body: frame })
        : route.fulfill({ status: 204, body: "" });
    }
    const stopMatch = /^\/api\/computer\/tasks\/([^/]+)\/stop$/.exec(path);
    if (stopMatch) {
      stops.push(stopMatch[1]);
      setTask(stopMatch[1], { stopping: true });
      return route.fulfill({ json: { task: tasks.find((item) => item.id === stopMatch[1]) } });
    }
    const replyMatch = /^\/api\/computer\/tasks\/([^/]+)\/reply$/.exec(path);
    if (replyMatch) {
      replies.push((request.postDataJSON() as { message: string }).message);
      tasks = tasks.map((item) =>
        item.id === replyMatch[1] ? { ...item, status: "running", question: null } : item,
      );
      return route.fulfill({ json: { task: tasks.find((item) => item.id === replyMatch[1]) } });
    }
    const controlInputMatch = /^\/api\/computer\/tasks\/([^/]+)\/control\/input$/.exec(path);
    if (controlInputMatch) {
      const input = request.postDataJSON() as {
        kind?: string;
        url?: string;
        action?: string;
        tabId?: string;
      };
      ownerInputs.push(input);
      if (input.kind === "navigate" && input.url) {
        const url = new URL(
          input.url.includes("://") ? input.url : `https://${input.url}`,
        ).toString();
        setTask(controlInputMatch[1], { currentUrl: url, frameUrl: url });
      } else if (input.kind === "click" && options.clickNavigatesTo) {
        setTask(controlInputMatch[1], {
          currentUrl: options.clickNavigatesTo,
          frameUrl: options.clickNavigatesTo,
        });
      } else if (input.kind === "switch_tab" && input.tabId) {
        const current = tasks.find((item) => item.id === controlInputMatch[1]);
        const tabs = current?.ownerTabs as Array<{ id: string; label: string; active: boolean }>;
        setTask(controlInputMatch[1], {
          ownerTabs: tabs.map((tab) => ({ ...tab, active: tab.id === input.tabId })),
        });
      } else if (input.kind === "new_tab") {
        const current = tasks.find((item) => item.id === controlInputMatch[1]);
        const tabs = current?.ownerTabs as Array<{ id: string; label: string; active: boolean }>;
        setTask(controlInputMatch[1], {
          currentUrl: null,
          ownerTabs: [
            ...tabs.map((tab) => ({ ...tab, active: false })),
            { id: "tab-new", label: "New tab", active: true },
          ],
        });
      } else if (input.kind === "close_tab") {
        const current = tasks.find((item) => item.id === controlInputMatch[1]);
        const tabs = current?.ownerTabs as Array<{ id: string; label: string; active: boolean }>;
        setTask(controlInputMatch[1], { ownerTabs: tabs.filter((tab) => tab.id !== input.tabId) });
      } else if (input.kind === "save_login") {
        setTask(controlInputMatch[1], {
          ownerSavedLogins: [
            { origin: "https://austinplumbers.example", label: "austinplumbers.example" },
          ],
        });
      } else if (input.kind === "clear_saved_login") {
        setTask(controlInputMatch[1], { ownerSavedLogins: [] });
      }
      if (options.ownerInputDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.ownerInputDelayMs));
      }
      return route.fulfill({
        json: { task: tasks.find((item) => item.id === controlInputMatch[1]) },
      });
    }
    if (/^\/api\/computer\/tasks\/[^/]+\/downloads\/[^/]+$/.test(path)) {
      return route.fulfill({
        contentType: "application/octet-stream",
        body: "A synthetic owner download.",
      });
    }
    const controlReturnMatch = /^\/api\/computer\/tasks\/([^/]+)\/control\/return$/.exec(path);
    if (controlReturnMatch) {
      returns.push(controlReturnMatch[1]);
      const body = request.postDataJSON() as { goal?: string };
      tasks = tasks.map((item) =>
        item.id === controlReturnMatch[1]
          ? {
              ...item,
              status: "running",
              question: null,
              ownerControl: false,
              preparingBrowser: false,
              goal: body.goal ?? item.goal,
            }
          : item,
      );
      return route.fulfill({
        json: { task: tasks.find((item) => item.id === controlReturnMatch[1]) },
      });
    }
    const controlMatch = /^\/api\/computer\/tasks\/([^/]+)\/control$/.exec(path);
    if (controlMatch) {
      takeovers.push(controlMatch[1]);
      const current = tasks.find((item) => item.id === controlMatch[1]);
      setTask(
        controlMatch[1],
        current?.status === "running"
          ? { controlRequested: true, ownerControl: false }
          : { controlRequested: false, ownerControl: true },
      );
      return route.fulfill({ json: { task: tasks.find((item) => item.id === controlMatch[1]) } });
    }
    const taskMatch = /^\/api\/computer\/tasks\/([^/]+)$/.exec(path);
    if (taskMatch) {
      return route.fulfill({ json: { task: tasks.find((item) => item.id === taskMatch[1]) } });
    }
    return route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [], threads: [] },
    });
  });
  return {
    replies,
    stops,
    ownerInputs,
    takeovers,
    returns,
    starts,
    get listReads() {
      return listReads;
    },
    addTask: (next: MockTask) => {
      tasks = [next, ...tasks];
    },
    setTask,
    getTask: (id: string) => structuredClone(tasks.find((item) => item.id === id)),
    setFrame: (next: Buffer | null) => {
      frame = next;
    },
    recoverLoad: () => {
      recoverLoad = true;
    },
  };
}

/** Nothing in the computer layout is wider than its box, and nothing scrolls sideways. */
async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        // The shell clips the page, so the root width alone can never fail.
        const content = document.querySelector(".wl-workspace-content");
        if (!content || content.scrollWidth > content.clientWidth + 1) return "workspace content";
        for (const element of document.querySelectorAll(".wl-computer-layout *")) {
          if (!(element instanceof HTMLElement)) continue;
          // Form fields scroll their own text, the activity log is a deliberate
          // scroller, and screen-reader text is clipped to 1px by design.
          if (element.matches("input, textarea, select")) continue;
          if (element.closest(".wl-computer-activity ol, .sr-only")) continue;
          const style = getComputedStyle(element);
          if (style.textOverflow === "ellipsis") continue;
          if (element.scrollWidth > element.clientWidth + 1) {
            return `${element.tagName.toLowerCase()}.${element.className}`;
          }
          if (element.getBoundingClientRect().right > innerWidth + 1) {
            return `${element.tagName.toLowerCase()}.${element.className} (off screen)`;
          }
        }
        return "none";
      }),
    )
    .toBe("none");
}

async function capture(page: Page, info: TestInfo, name: string) {
  if (!process.env.BOTBOUND_DESIGN_PROOF_DIR) return;
  await mkdir(process.env.BOTBOUND_DESIGN_PROOF_DIR, { recursive: true });
  const path = join(process.env.BOTBOUND_DESIGN_PROOF_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

const READY = { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 120 } };

for (const width of [390, 1024]) {
  test(`a finished task opens on its result and keeps a new task one click away at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await mockComputer(page, {
      status: READY,
      tasks: [
        task({
          id: "task-recent",
          status: "completed",
          goal: "Check our Google Business page.",
          summary: "The listing has Saturday hours.",
          liveView: false,
        }),
        task({
          id: "task-older",
          status: "completed",
          goal: "Compare supplier prices.",
          summary: "Supplier A costs less.",
          liveView: false,
        }),
      ],
    });

    await page.goto("/computer");
    const result = page.getByRole("region", { name: "Check our Google Business page." });
    await expect(result.getByText("The listing has Saturday hours.")).toBeVisible();
    await expect(result.getByText("Check our Google Business page.", { exact: true })).toBeHidden();
    await result.locator("summary").click();
    await expect(
      result.getByText("Check our Google Business page.", { exact: true }),
    ).toBeVisible();
    await result.locator("summary").click();
    await expect(result.getByText(/Browser screen cleared/)).toHaveCount(0);
    await expect(page.locator(".wl-computer-composer")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Recent Tasks" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `computer-completed-result-${width}`);

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.getByRole("textbox", { name: "What should your Bot do?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to task" })).toBeVisible();
    await capture(page, info, `computer-new-task-${width}`);

    await page.getByRole("button", { name: "Tasks" }).click();
    const history = page.getByRole("dialog", { name: "Recent Tasks" });
    await history.getByRole("button", { name: /Compare supplier prices/ }).click();
    await expect(history).toHaveCount(0);
    await expect(page.locator(".wl-computer-composer")).toHaveCount(0);
    await expect(page.getByText("Supplier A costs less.")).toBeVisible();
  });
}

test("owner can switch back from a login popup on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { ownerInputs } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({
        id: "task-popup",
        status: "needs_input",
        question: "Sign in to continue.",
        ownerControl: true,
        ownerTabs: [
          { id: "tab-1", label: "Tab 1 · supplier.example", active: false },
          { id: "tab-2", label: "Tab 2 · accounts.example", active: true },
        ],
      }),
    ],
  });

  await page.goto("/computer");
  const tabs = page.getByRole("group", { name: "Browser tabs" });
  await expect(tabs.getByRole("button", { name: "Tab 2 · accounts.example" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("button", { name: "Tab 1 · supplier.example" }).click();
  await expect(tabs.getByRole("button", { name: "Tab 1 · supplier.example" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(ownerInputs).toContainEqual({ kind: "switch_tab", tabId: "tab-1" });
  await expectNoHorizontalOverflow(page);
});

for (const width of [390, 1024]) {
  test(`a Bot that needs the owner shows its screen, question, and reply at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const frame = await fakeFrame(page);
    const { replies } = await mockComputer(page, {
      status: READY,
      frame,
      tasks: [
        task({
          id: "task-live",
          status: "needs_input",
          question: "The directory asks me to sign in to see more listings. Should I skip it?",
          events: [
            {
              at: NOW,
              kind: "action",
              text: "Opened austinplumbers.example",
              url: "https://austinplumbers.example/",
            },
            { at: NOW, kind: "action", text: 'Clicked "Open Saturday"', ok: true },
            {
              at: NOW,
              kind: "question",
              text: "The directory asks me to sign in. Should I skip it?",
            },
          ],
        }),
        task({
          id: "task-done",
          status: "completed",
          goal: "Check our Google Business page and tell me if our hours match our website.",
          summary: "Your hours match on both pages.",
          liveView: false,
        }),
      ],
    });

    await page.goto("/computer");
    await expect(page.getByRole("heading", { level: 1, name: "Computer" })).toBeVisible();
    const detail = page.getByRole("region", { name: /Find three plumbers/ });
    await expect(detail.getByText("Needs You", { exact: true })).toBeVisible();
    await expect(detail.getByText(/asks me to sign in to see more listings/)).toBeVisible();
    await expect(
      detail.getByRole("img", { name: "What your Bot's cloud computer shows right now" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open browser", exact: true })).toHaveCount(0);
    // The live browser owns the page until the task finishes.
    const stop = await detail.getByRole("button", { name: "Stop" }).boundingBox();
    expect(stop && stop.width > stop.height).toBe(true);
    await expect(page.locator(".wl-computer-composer")).toHaveCount(0);
    await detail.getByRole("button", { name: "Open task activity" }).click();
    const activity = page.getByRole("dialog", { name: "Task Activity" });
    await expect(activity.getByText('Clicked "Open Saturday"')).toBeVisible();
    await activity.getByRole("button", { name: "Close" }).click();
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `computer-needs-input-${width}`);

    await detail.getByRole("textbox", { name: "Reply to your Bot" }).fill("Yes, skip the sign in.");
    await detail.getByRole("button", { name: "Reply" }).click();
    await expect(detail.getByText("Working", { exact: true })).toBeVisible();
    expect(replies).toEqual(["Yes, skip the sign in."]);

    await page.getByRole("button", { name: "Tasks" }).click();
    const history = page.getByRole("dialog", { name: "Recent Tasks" });
    await history.getByRole("button", { name: /Google Business page/ }).click();
    await expect(history).toHaveCount(0);
    await expect(page.getByText("Your hours match on both pages.")).toBeVisible();
    // The finished task never shows the live task's screen.
    const finished = page.getByRole("region", { name: /Google Business page/ });
    await expect(finished.getByText("Your hours match on both pages.")).toBeVisible();
    await expect(
      finished.getByText("The browser screen was cleared after this task ended."),
    ).toHaveCount(0);
    await expect(finished.locator(".wl-computer-screen")).toHaveCount(0);
    await expect(finished.getByRole("img")).toHaveCount(0);
  });
}

test("a running task requests control honestly and keeps Stop available while pausing", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const { takeovers, setTask, returns } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [task({ id: "task-live", status: "running" })],
  });
  await page.goto("/computer");
  const detail = page.getByRole("region", { name: /Find three plumbers/ });
  await detail.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(detail.getByRole("button", { name: "Pausing…" })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(
    detail.getByText("Your Bot is finishing its current step, then the browser is yours."),
  ).toBeVisible();
  await expect(detail.getByText("You control the browser", { exact: true })).toHaveCount(0);
  expect(takeovers).toEqual(["task-live"]);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await capture(page, info, "computer-pausing-320-enlarged-text");
  setTask("task-live", {
    status: "needs_input",
    controlRequested: false,
    ownerControl: true,
    question: "You paused your Bot. Browse, then return control when you’re ready.",
  });
  await expect(detail.getByText("You control the browser", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Return control to Bot", exact: true }).click();
  expect(returns).toEqual(["task-live"]);
  await expect(detail.getByRole("button", { name: "Take control", exact: true })).toBeVisible();
});

test("a running task keeps updating while the owner reads an older result", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const { stops, setTask } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({ id: "task-live", status: "running" }),
      task({
        id: "task-done",
        status: "completed",
        goal: "Check our Google Business page and tell me if our hours match our website.",
        summary: "Your hours match on both pages.",
        liveView: false,
      }),
    ],
  });

  await page.goto("/computer");
  const detail = page.getByRole("region", { name: /Find three plumbers/ });
  await expect(
    detail.getByRole("img", { name: "What your Bot's cloud computer shows right now" }),
  ).toBeVisible();

  // Stop waits for the Bot's next checkpoint, and says so.
  await detail.getByRole("button", { name: "Stop" }).click();
  await expect(detail.getByRole("button", { name: "Stopping…" })).toBeDisabled();
  expect(stops).toEqual(["task-live"]);
  await capture(page, info, "computer-stopping");

  await page.getByRole("button", { name: "Tasks" }).click();
  const history = page.getByRole("dialog", { name: "Recent Tasks" });
  await history.getByRole("button", { name: /Google Business page/ }).click();
  await expect(page.getByText("Your hours match on both pages.")).toBeVisible();

  // The running task is still followed while the owner reads another one.
  setTask("task-live", {
    status: "stopped",
    stopping: false,
    summary: "Stopped.",
    liveView: false,
  });
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(
    history.getByRole("button", { name: /Find three plumbers/ }).getByText("Stopped"),
  ).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Task stopped.", { exact: true })).toBeAttached();
  await expect(
    page
      .getByRole("region", { name: /Find three plumbers/ })
      .getByText("Stopped.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task" }).click();
  await page
    .getByRole("textbox", { name: "What should your Bot do?" })
    .fill("Compare two supplier prices.");
  await expect(page.getByRole("button", { name: "Start Task" })).toBeEnabled();
});

test("a Bot link never starts a task on another Bot, and changing Bot updates the link", async ({
  page,
}) => {
  const { starts } = await mockComputer(page, {
    status: READY,
    tasks: [],
    agents: [
      { id: "design-bot", name: "Front Desk" },
      { id: "sales-bot", name: "Sales" },
    ],
  });

  await page.goto("/computer?agent=deleted-bot");
  await expect(page.getByText("Bot Unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Task" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open browser" })).toHaveCount(0);
  await page.getByRole("link", { name: "Choose Bot" }).click();
  await expect(page).toHaveURL(/\/computer$/);
  await expect(page.getByRole("combobox", { name: "Bot" })).toHaveValue("design-bot");

  await page.goto("/computer?agent=design-bot");
  await page.getByRole("combobox", { name: "Bot" }).selectOption("sales-bot");
  await expect(page).toHaveURL(/\/computer\?agent=sales-bot$/);
  await expect(page.getByRole("combobox", { name: "Bot" })).toHaveValue("sales-bot");
  await page.getByRole("textbox", { name: "What should your Bot do?" }).fill("Check our listing.");
  await expect(page.getByRole("combobox", { name: "Bot" })).toHaveValue("sales-bot");
  await page.getByRole("button", { name: "Start Task" }).click();
  expect(starts).toEqual([expect.objectContaining({ agentId: "sales-bot" })]);
});

test("a task started elsewhere appears on the idle page without losing a draft", async ({
  page,
}) => {
  const mock = await mockComputer(page, {
    status: READY,
    tasks: [
      task({
        id: "task-done",
        status: "completed",
        goal: "Check yesterday's listing.",
        summary: "The listing is current.",
        liveView: false,
      }),
    ],
  });
  await page.goto("/computer");
  await expect(page.getByText("The listing is current.")).toBeVisible();
  await page.getByRole("button", { name: "New task" }).click();
  const draft = page.getByRole("textbox", { name: "What should your Bot do?" });
  await draft.fill("Compare two supplier prices tomorrow.");

  mock.addTask(task({ id: "task-elsewhere", status: "running", goal: "Check live inventory." }));
  const readsBeforeReturn = mock.listReads;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "View active task" })).toBeVisible();
  expect(mock.listReads).toBe(readsBeforeReturn + 1);
  await page.getByRole("button", { name: "View active task" }).click();
  await expect(page.getByRole("region", { name: "Check live inventory." })).toBeVisible();

  mock.setTask("task-elsewhere", {
    status: "completed",
    summary: "Inventory checked.",
    liveView: false,
  });
  await expect(page.getByText("Inventory checked.")).toBeVisible({ timeout: 7000 });
  await page.getByRole("button", { name: "New task" }).click();
  await expect(draft).toHaveValue("Compare two supplier prices tomorrow.");
});

test("an idle visible Computer page discovers a new task on its next light refresh", async ({
  page,
}) => {
  await page.clock.install();
  const mock = await mockComputer(page, { status: READY, tasks: [] });
  await page.goto("/computer");
  await expect(page.getByRole("button", { name: "Start Task" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Open browser" })).toBeEnabled();
  const readsBefore = mock.listReads;

  mock.addTask(task({ id: "task-from-phone", status: "running", goal: "Review today's orders." }));
  await page.clock.fastForward(8100);
  await expect(page.getByRole("region", { name: "Review today's orders." })).toBeVisible();
  expect(mock.listReads).toBe(readsBefore + 1);
});

test("expanded browser keeps controls below the screen and Activity on one line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({
        id: "task-browser",
        status: "needs_input",
        ownerControl: true,
        preparingBrowser: true,
        goal: "Compare several local service providers and summarize availability and pricing.",
        question: "Browse first, then give your Bot a task.",
      }),
    ],
  });
  await page.goto("/computer");
  const detail = page.getByRole("region", { name: "Your browser is ready" });
  // The application's owner wait does not guarantee the provider's browser lease.
  await expect(detail.getByText(/within 10 minutes/i)).toHaveCount(0);
  const activity = detail.getByRole("button", { name: "Open task activity" });
  await expect(activity).toBeVisible();
  await expect(activity).toHaveCSS("white-space", "nowrap");
  const textLines = await activity.evaluate((button) => {
    const text = [...button.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    );
    if (!text) return 0;
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getClientRects().length;
  });
  expect(textLines).toBe(1);

  await detail.getByRole("button", { name: "Expand browser" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  const screenBox = await detail.locator(".wl-computer-screen").boundingBox();
  const handoffBox = await detail.locator("#computer-handoff-goal").boundingBox();
  expect(
    screenBox && handoffBox && screenBox.y + screenBox.height <= handoffBox.y + 1,
    JSON.stringify({ screenBox, handoffBox }),
  ).toBe(true);
});

for (const width of [390, 1024]) {
  test(`the owner can take over, interact with the live browser, and return control at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const { ownerInputs, takeovers, returns } = await mockComputer(page, {
      status: READY,
      frame: await fakeFrame(page),
      tasks: [
        task({
          id: "task-live",
          status: "needs_input",
          question: "The site asks me to sign in before I can continue.",
        }),
      ],
    });

    await page.goto("/computer");
    const detail = page.getByRole("region", { name: /Find three plumbers/ });
    await expect(detail.getByText("Front Desk", { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "Take control" }).click();
    await expect(detail.getByText("You control the browser")).toBeVisible();
    expect(takeovers).toEqual(["task-live"]);

    const screen = detail.getByRole("img", {
      name: "Browser screen. Click or drag to interact with the page.",
    });
    await expect(screen).toBeVisible();
    const bounds = await screen.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) {
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    }
    await detail
      .getByRole("textbox", { name: "Type into selected field" })
      .fill("owner@example.test");
    await detail.getByRole("button", { name: "Show entered text" }).click();
    await expect(detail.getByRole("textbox", { name: "Type into selected field" })).toHaveAttribute(
      "type",
      "text",
    );
    await detail.getByRole("button", { name: "Send to page" }).click();
    await expect(detail.getByRole("textbox", { name: "Type into selected field" })).toHaveValue("");
    await expect(detail.locator("#computer-owner-input")).toHaveAttribute("type", "password");
    const browserBar = detail.locator(".wl-computer-screen__bar");
    await browserBar.getByRole("button", { name: "Expand browser" }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await browserBar.getByRole("button", { name: "Exit expanded browser" }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    const address = browserBar.getByRole("textbox", { name: "Web address" });
    await address.fill("https://login.example.test");
    await browserBar.getByRole("button", { name: "Go to website" }).click();
    await expect(address).toHaveValue("https://login.example.test/");
    await browserBar.getByRole("button", { name: "Back", exact: true }).click();
    await detail.getByText("Keyboard controls", { exact: true }).click();
    const browserKeys = detail.getByRole("group", { name: "Browser navigation keys" });
    for (const label of [
      "Tab",
      "Shift + Tab",
      "Enter",
      "Space",
      "Backspace",
      "Delete",
      "Esc",
      "Up",
      "Down",
      "Left",
      "Right",
      "Home",
      "End",
      "Page Up",
      "Page Down",
    ]) {
      await expect(browserKeys.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Tab", "Shift + Tab", "Space", "Page Down", "Delete"]) {
      await browserKeys.getByRole("button", { name: label, exact: true }).click();
    }
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "type", text: "owner@example.test" }),
    );
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "Tab" }));
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "Shift+Tab" }));
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "Space" }));
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "PageDown" }));
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "Delete" }));
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "navigate", url: "https://login.example.test" }),
    );
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "history", action: "back" }),
    );
    expect(ownerInputs.some((input) => (input as { kind?: string }).kind === "click")).toBe(true);
    await expectNoHorizontalOverflow(page);
    const screenBox = await detail.locator(".wl-computer-screen").boundingBox();
    const controlsBox = await detail.locator(".wl-computer-control").boundingBox();
    // Browser controls stay below the full-width viewer instead of taking a side rail.
    expect(
      screenBox && controlsBox && screenBox.y + screenBox.height <= controlsBox.y + 1,
      JSON.stringify({ screenBox, controlsBox }),
    ).toBe(true);
    await capture(page, info, `computer-owner-control-${width}`);

    await detail.getByRole("button", { name: "Return control to Bot" }).click();
    await expect(detail.getByText("Working", { exact: true })).toBeVisible();
    expect(returns).toEqual(["task-live"]);
  });

  test(`a focused browser key can be repeated after a slow owner action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const { ownerInputs } = await mockComputer(page, {
      status: READY,
      frame: await fakeFrame(page),
      ownerInputDelayMs: 600,
      tasks: [
        task({
          id: "task-live",
          status: "needs_input",
          question: "The site asks me to sign in before I can continue.",
        }),
      ],
    });

    await page.goto("/computer");
    const detail = page.getByRole("region", { name: /Find three plumbers/ });
    await detail.getByRole("button", { name: "Take control" }).click();
    const disclosure = detail.getByText("Keyboard controls", { exact: true });
    await disclosure.focus();
    await disclosure.press("Enter");
    const tabKey = detail
      .getByRole("group", { name: "Browser navigation keys" })
      .getByRole("button", { name: "Tab", exact: true });
    const tabActions = () =>
      ownerInputs.filter((input) => {
        const action = input as { kind?: string; key?: string };
        return action.kind === "key" && action.key === "Tab";
      }).length;

    await tabKey.focus();
    await tabKey.press("Enter");
    await expect(tabKey).toHaveAttribute("aria-disabled", "true");
    await expect(tabKey).toBeFocused();
    await tabKey.press("Enter");
    await expect.poll(tabActions).toBe(1);
    await expect(tabKey).not.toHaveAttribute("aria-disabled", "true");
    await expect(tabKey).toBeFocused();
    await tabKey.press("Enter");
    await expect.poll(tabActions).toBe(2);
    await expect(tabKey).toBeFocused();
  });
}

for (const width of [390, 1024]) {
  test(`the owner can open a browser before entering a URL or goal at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const { starts, ownerInputs, returns } = await mockComputer(page, {
      status: READY,
      frame: await fakeFrame(page),
      tasks: [],
    });

    await page.goto("/computer");
    await expect(
      page.locator(".wl-computer-launch-browser__canvas").getByText("A fresh browser"),
    ).toBeVisible();
    await expect(
      page.locator(".wl-computer-launch-browser__bar").getByRole("textbox", {
        name: "Web address",
      }),
    ).toBeVisible();
    await capture(page, info, `computer-idle-${width}`);
    await page.getByRole("button", { name: "Open browser" }).click();
    expect(starts).toEqual([{ agentId: "design-bot", prepareBrowser: true }]);
    const detail = page.getByRole("region", { name: "Your browser is ready" });
    await expect(detail.getByText("You control the browser")).toBeVisible();
    await expect(detail.locator(".wl-computer-new-tab")).toBeVisible();
    await expect(
      detail.getByRole("img", {
        name: "Browser screen. Click or drag to interact with the page.",
      }),
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "Give task to Bot" })).toBeDisabled();
    await capture(page, info, `computer-browse-first-${width}-top`);
    const browserBar = detail.locator(".wl-computer-screen__bar");
    await browserBar.getByRole("textbox", { name: "Web address" }).fill("google.com");
    await browserBar.getByRole("button", { name: "Go to website" }).click();
    expect(ownerInputs).toContainEqual({ kind: "navigate", url: "google.com" });
    await expect(detail.locator(".wl-computer-new-tab")).toHaveCount(0);
    await detail
      .getByRole("textbox", { name: "What should your Bot do from here?" })
      .fill("Find the official support phone number on this site.");
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `computer-browse-first-${width}`);
    await detail.getByRole("button", { name: "Give task to Bot" }).click();
    const working = page.getByRole("region", {
      name: "Find the official support phone number on this site.",
    });
    await expect(working.getByText("Working", { exact: true })).toBeVisible();
    expect(returns).toEqual(["task-new"]);
  });
}

for (const width of [390, 1024]) {
  test(`an address in the idle browser opens that site before owner control at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const { starts, ownerInputs } = await mockComputer(page, {
      status: READY,
      frame: await fakeFrame(page),
      tasks: [],
    });

    await page.goto("/computer");
    const startAddress = page
      .locator(".wl-computer-launch-browser__bar")
      .getByRole("textbox", { name: "Web address" });
    await startAddress.fill("google.com");
    await startAddress.press("Enter");
    const detail = page.getByRole("region", { name: "Your browser is ready" });
    await expect(detail).toBeVisible();
    expect(starts).toEqual([
      { agentId: "design-bot", prepareBrowser: true, startUrl: "google.com" },
    ]);
    await expect(
      detail.locator(".wl-computer-screen__bar").getByRole("textbox", { name: "Web address" }),
    ).toHaveValue("https://google.com/");
    await expect(detail.locator(".wl-computer-new-tab")).toHaveCount(0);
    await expect(
      detail.getByRole("img", { name: "Browser screen. Click or drag to interact with the page." }),
    ).toBeVisible();
    expect(ownerInputs).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
}

test("the browser address follows a clicked link and a later redirect", async ({ page }) => {
  const { setTask, ownerInputs } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    clickNavigatesTo: "https://www.iana.org/domains/reserved",
    tasks: [
      task({
        id: "task-live",
        status: "needs_input",
        ownerControl: true,
        currentUrl: "https://example.com/",
        frameUrl: "https://example.com/",
      }),
    ],
  });
  await page.goto("/computer");
  const detail = page.getByRole("region", { name: /Find three plumbers/ });
  const address = detail.getByRole("textbox", { name: "Web address" });
  await expect(address).toHaveValue("https://example.com/");
  const screen = detail.getByRole("img", {
    name: "Browser screen. Click or drag to interact with the page.",
  });
  const bounds = await screen.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }
  await expect.poll(() => ownerInputs.length).toBeGreaterThan(0);
  await expect(address).toHaveValue("https://www.iana.org/domains/reserved");

  setTask("task-live", {
    currentUrl: "https://www.iana.org/help",
    frameUrl: "https://www.iana.org/help",
  });
  await expect(address).toHaveValue("https://www.iana.org/help");

  await address.fill("example.org");
  await address.press("Enter");
  await expect(address).toHaveValue("https://example.org/");
  await address.focus();
  await expect(address).toBeFocused();
  setTask("task-live", {
    currentUrl: "https://example.org/redirected",
    frameUrl: "https://example.org/redirected",
  });
  await expect(address).toHaveValue("https://example.org/redirected");
});

test("starting fresh work clears the previous completion announcement", async ({ page }) => {
  const { setTask } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [task({ id: "task-live", status: "running" })],
  });
  await page.goto("/computer");
  await expect(page.getByRole("region", { name: /Find three plumbers/ })).toBeVisible();
  setTask("task-live", {
    status: "completed",
    summary: "The research is complete.",
    liveView: false,
  });
  const announcement = page.locator('[aria-live="polite"][aria-atomic="true"]');
  await expect(announcement).toHaveText("Task completed.");
  await page.getByRole("button", { name: "New task" }).click();
  await page
    .getByRole("textbox", { name: "What should your Bot do?" })
    .fill("Find three suppliers.");
  await page.getByRole("button", { name: "Start Task" }).click();
  await expect(page.getByRole("region", { name: "Find three suppliers." })).toBeVisible();
  await expect(announcement).toHaveText("");
});

test("a lost frame clears the old screen instead of looking live", async ({ page }) => {
  const { setFrame } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [task({ id: "task-live", status: "running" })],
  });
  await page.goto("/computer");
  const detail = page.getByRole("region", { name: /Find three plumbers/ });
  await expect(
    detail.getByRole("img", { name: "What your Bot's cloud computer shows right now" }),
  ).toBeVisible();
  setFrame(null);
  await expect(detail.getByText("The screen is temporarily unavailable. Retrying…")).toBeVisible({
    timeout: 7000,
  });
  await expect(detail.getByRole("img")).toHaveCount(0);
});

test("a page that did not load offers a retry instead of a dead form", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const { recoverLoad } = await mockComputer(page, {
    status: READY,
    tasks: [],
    failFirstLoad: true,
  });

  await page.goto("/computer");
  await expect(page.getByText("Your Bot's Computer Did Not Load")).toBeVisible();
  await expect(page.getByText("Tasks Could Not Load", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry tasks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Recent Tasks" });
  await expect(history.getByText("Recent tasks did not load.")).toBeVisible();
  await expect(page.getByText("The Task Did Not Start")).toHaveCount(0);
  await capture(page, info, "computer-load-retry");

  recoverLoad();
  await history.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Retry tasks", exact: true }).click();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByText("Your Bot's Computer Did Not Load")).toHaveCount(0);
  await expect(history.getByText("No tasks yet.")).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("textbox", { name: "What should your Bot do?" })
    .fill("Compare two supplier prices.");
  await expect(page.getByRole("button", { name: "Start Task" })).toBeEnabled();
});

test("an account without a paid plan sees one clear upgrade path", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mockComputer(page, {
    status: {
      available: false,
      reason: "plan_required",
      limits: { maxMinutes: 15, maxSteps: 120 },
    },
    tasks: [],
  });
  await page.goto("/computer");
  await expect(page.getByText("Give Your Bot Its Own Computer")).toBeVisible();
  await expect(page.getByRole("link", { name: "See Plans" })).toHaveAttribute(
    "href",
    "/settings/billing",
  );
  await page
    .getByRole("group", { name: "Example tasks" })
    .getByRole("button", { name: "Check our listing" })
    .click();
  await expect(page.getByRole("textbox", { name: "What should your Bot do?" })).toHaveValue(
    /Google Business page/,
  );
  await expect(page.getByRole("button", { name: "Start Task" })).toBeDisabled();
});

test("browser toolbar manages tabs, screenshots, history and owner downloads", async ({ page }) => {
  const { ownerInputs } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({
        id: "task-tools",
        status: "needs_input",
        ownerControl: true,
        browserCapabilities: OWNER_BROWSER_CAPABILITIES,
        ownerTabs: [{ id: "tab-1", label: "Plumbing directory", active: true }],
        ownerHistory: [
          {
            id: 1,
            tabId: "tab-1",
            label: "Previous directory",
            url: "https://previous.example/",
            visitedAt: NOW,
          },
        ],
        ownerDownloads: [{ id: "download-1", name: "comparison.txt", bytes: 27, createdAt: NOW }],
      }),
    ],
  });
  await page.goto("/computer");
  await expect(
    page.getByRole("button", { name: "Close Plumbing directory tab", exact: true }),
  ).toBeDisabled();
  expect(ownerInputs).toEqual([]);
  await expect(page.getByRole("button", { name: "Download browser screenshot" })).toBeEnabled();
  const screenshot = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download browser screenshot" }).click();
  expect((await screenshot).suggestedFilename()).toMatch(/^botbound-screen-\d+\.jpg$/);

  await page.getByRole("button", { name: "New browser tab" }).click();
  await expect(page.getByRole("button", { name: "New tab", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Close New tab tab" }).click();
  await expect(page.getByRole("button", { name: "Close New tab tab" })).toHaveCount(0);
  expect(ownerInputs).toContainEqual({ kind: "new_tab" });
  expect(ownerInputs).toContainEqual({ kind: "close_tab", tabId: "tab-new" });
  await expect(
    page.getByRole("button", { name: "Close Plumbing directory tab", exact: true }),
  ).toBeDisabled();
  expect(
    ownerInputs.filter((input) => (input as { kind?: string }).kind === "close_tab"),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Open browser tools" }).click();
  const tools = page.getByRole("dialog", { name: "Browser tools" });
  const file = page.waitForEvent("download");
  await tools.getByRole("button", { name: /comparison.txt/ }).click();
  expect((await file).suggestedFilename()).toBe("comparison.txt");
  await tools.getByRole("button", { name: /Previous directory/ }).click();
  await expect(tools).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Web address", exact: true })).toHaveValue(
    "https://previous.example/",
  );
  expect(ownerInputs).toContainEqual({ kind: "navigate", url: "https://previous.example/" });
});

test("session tools send explicit cookie and login actions without retaining secret fields", async ({
  page,
}) => {
  const { ownerInputs, setTask } = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({
        id: "task-private-tools",
        status: "needs_input",
        ownerControl: true,
        browserCapabilities: OWNER_BROWSER_CAPABILITIES,
      }),
    ],
  });
  await page.goto("/computer");
  await page.getByRole("button", { name: "Open browser tools" }).click();
  const tools = page.getByRole("dialog", { name: "Browser tools" });
  const fileInput = tools.getByLabel("Import session cookies");
  await fileInput.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('"private-cookie-token" invalid'),
  });
  await expect(
    tools.getByText("Choose a valid JSON file containing an array of cookies."),
  ).toBeVisible();
  await expect(tools.getByText(/private-cookie-token/)).toHaveCount(0);
  const cookies = [
    {
      name: "session",
      value: "synthetic-cookie-value",
      url: "https://austinplumbers.example/",
      secure: true,
    },
  ];
  await fileInput.setInputFiles({
    name: "cookies.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(cookies)),
  });
  await expect.poll(() => ownerInputs).toContainEqual({ kind: "import_cookies", cookies });
  await tools.getByRole("button", { name: "Clear cookies", exact: true }).click();
  await expect.poll(() => ownerInputs).toContainEqual({ kind: "clear_cookies" });

  await tools.getByLabel("Username", { exact: true }).fill("owner@example.test");
  await tools.getByLabel("Password", { exact: true }).fill("synthetic-session-password");
  await tools.getByRole("button", { name: "Save for session", exact: true }).click();
  await expect(tools.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(tools.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(tools.getByRole("button", { name: "Fill login", exact: true })).toBeEnabled();
  await tools.getByRole("button", { name: "Fill login", exact: true }).click();
  await expect
    .poll(() => ownerInputs)
    .toContainEqual({ kind: "fill_login", origin: "https://austinplumbers.example" });
  expect(ownerInputs).toContainEqual({
    kind: "save_login",
    origin: "https://austinplumbers.example",
    username: "owner@example.test",
    password: "synthetic-session-password",
  });
  await tools.getByLabel("Username", { exact: true }).fill("unfinished-user");
  await tools.getByLabel("Password", { exact: true }).fill("unfinished-secret");
  setTask("task-private-tools", { currentUrl: "https://other.example/" });
  await expect(tools.getByText("https://other.example", { exact: true })).toBeVisible();
  await expect(tools.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(tools.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(tools.getByRole("button", { name: "Fill login", exact: true })).toBeDisabled();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain("synthetic-session-password");
  expect(storage).not.toContain("synthetic-cookie-value");
  await expect(
    tools.getByText("This isolated browser does not support installing extensions."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tools).toHaveCount(0);
});

test("delayed reads cannot undo confirmed take control, navigation, or pending Stop", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const fixture = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [
      task({ id: "task-owner-race", status: "needs_input", question: "Sign in to continue." }),
    ],
  });
  await page.goto("/computer");
  const detail = page.getByRole("region", { name: /Find three plumbers/ });
  await expect(detail).toBeVisible();
  const holdRead = async () => {
    let held = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/computer/tasks/task-owner-race", async (route) => {
      if (held) return route.fallback();
      held = true;
      const snapshot = fixture.getTask("task-owner-race");
      await gate;
      await route.fulfill({ json: { task: snapshot } });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => held).toBe(true);
    return async () => {
      const response = page.waitForResponse(
        (item) =>
          item.url().endsWith("/api/computer/tasks/task-owner-race") &&
          item.request().method() === "GET",
      );
      release();
      await (await response).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    };
  };
  const finishTakeRead = await holdRead();
  await detail.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(detail.getByLabel("Type into selected field", { exact: true })).toBeVisible();
  await finishTakeRead();
  await expect(detail.getByLabel("Type into selected field", { exact: true })).toBeVisible();

  const finishInputRead = await holdRead();
  const address = detail.getByRole("textbox", { name: "Web address", exact: true });
  await address.fill("https://confirmed.example/");
  await address.press("Enter");
  await expect(address).toHaveValue("https://confirmed.example/");
  await expect(address).toBeEnabled();
  await finishInputRead();
  await expect(address).toHaveValue("https://confirmed.example/");

  const finishStopRead = await holdRead();
  await detail.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(detail.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
  await finishStopRead();
  await expect(detail.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
  // Even a later snapshot cannot retract a confirmed pending Stop before terminal state.
  fixture.setTask("task-owner-race", { stopping: false });
  const freshRead = page.waitForResponse(
    (item) =>
      item.url().endsWith("/api/computer/tasks/task-owner-race") &&
      item.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await (await freshRead).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(detail.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
});

test("a post-action409 requires refresh and inspection before repeating browser input", async ({
  page,
}) => {
  const fixture = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [task({ id: "task-uncertain-input", status: "needs_input", ownerControl: true })],
  });
  let writes = 0;
  await page.route("**/api/computer/tasks/task-uncertain-input/control/input", async (route) => {
    writes += 1;
    fixture.setTask("task-uncertain-input", { currentUrl: "https://submitted.example/" });
    await route.fulfill({
      status: 409,
      json: { error: "Browser input could not finish.", code: "COMPUTER_INPUT_FAILED" },
    });
  });
  await page.goto("/computer");
  const input = page.getByLabel("Type into selected field", { exact: true });
  await input.fill("synthetic-private-input");
  await page.getByRole("button", { name: "Show entered text", exact: true }).click();
  await page.getByRole("button", { name: "Send to page", exact: true }).click();
  await expect(
    page.getByText(
      "The browser action may have happened. Refresh work and inspect the page before repeating it.",
    ),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Return control to Bot", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Refresh work", exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Web address", exact: true })).toHaveValue(
    "https://submitted.example/",
  );
  expect(writes).toBe(1);
});

test("remote handback clears an unsent private field and its visibility preference", async ({
  page,
}) => {
  const fixture = await mockComputer(page, {
    status: READY,
    frame: await fakeFrame(page),
    tasks: [task({ id: "task-remote-return", status: "needs_input", ownerControl: true })],
  });
  await page.goto("/computer");
  const input = page.getByLabel("Type into selected field", { exact: true });
  await input.fill("unsent-synthetic-secret");
  const address = page.getByRole("textbox", { name: "Web address", exact: true });
  await address.fill("https://draft.example/?code=synthetic-code");
  await page.getByRole("button", { name: "Show entered text", exact: true }).click();
  await expect(input).toHaveAttribute("type", "text");
  fixture.setTask("task-remote-return", { ownerControl: false, status: "running" });
  await expect(input).toHaveCount(0);
  fixture.setTask("task-remote-return", { ownerControl: true, status: "needs_input" });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("type", "password");
  await expect(address).toHaveValue("https://austinplumbers.example/");
  expect(fixture.ownerInputs).toEqual([]);
});
