import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
    frame?: Buffer | null;
    /** Answer the first status and task-list reads with a server error. */
    failFirstLoad?: boolean;
  },
) {
  const replies: string[] = [];
  const stops: string[] = [];
  let tasks = options.tasks;
  let statusReads = 0;
  let listReads = 0;
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
          agents: [
            { id: "design-bot", name: "Front Desk", role: "receptionist", mark_key: "spark-rose" },
          ],
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
      statusReads += 1;
      return options.failFirstLoad && statusReads === 1
        ? route.fulfill({ status: 500, json: { error: "Something went wrong." } })
        : route.fulfill({ json: options.status });
    }
    if (path === "/api/computer/tasks" && request.method() === "GET") {
      listReads += 1;
      return options.failFirstLoad && listReads === 1
        ? route.fulfill({ status: 500, json: { error: "Something went wrong." } })
        : route.fulfill({ json: { tasks } });
    }
    const frameMatch = /^\/api\/computer\/tasks\/([^/]+)\/frame$/.exec(path);
    if (frameMatch) {
      // Like the server: a finished task's screen is gone.
      const live = ACTIVE.has(tasks.find((item) => item.id === frameMatch[1])?.status ?? "");
      return options.frame && live
        ? route.fulfill({ status: 200, contentType: "image/jpeg", body: options.frame })
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
    const taskMatch = /^\/api\/computer\/tasks\/([^/]+)$/.exec(path);
    if (taskMatch) {
      return route.fulfill({ json: { task: tasks.find((item) => item.id === taskMatch[1]) } });
    }
    return route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [], threads: [] },
    });
  });
  return { replies, stops, setTask };
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

for (const width of [390, 1440]) {
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
    await expect(page.getByRole("button", { name: "Bot Is Working" })).toBeDisabled();
    // The live task leads the page; Stop keeps its shape beside a long goal.
    const stop = await detail.getByRole("button", { name: "Stop" }).boundingBox();
    expect(stop && stop.width > stop.height).toBe(true);
    const order = await page.evaluate(() => {
      const detailTop = document.querySelector(".wl-computer-detail")!.getBoundingClientRect().top;
      const composerTop = document
        .querySelector(".wl-computer-composer")!
        .getBoundingClientRect().top;
      return detailTop < composerTop;
    });
    expect(order).toBe(true);
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `computer-needs-input-${width}`);

    await detail.getByRole("textbox", { name: "Reply to your Bot" }).fill("Yes, skip the sign in.");
    await detail.getByRole("button", { name: "Reply" }).click();
    await expect(detail.getByText("Working", { exact: true })).toBeVisible();
    expect(replies).toEqual(["Yes, skip the sign in."]);

    const history = page.getByRole("complementary", { name: "Recent tasks" });
    await history.getByRole("button", { name: /Google Business page/ }).click();
    await expect(page.getByText("Your hours match on both pages.")).toBeVisible();
    // The finished task never shows the live task's screen.
    const finished = page.getByRole("region", { name: /Google Business page/ });
    await expect(finished.getByText("The screen is cleared after a task ends.")).toBeVisible();
    await expect(finished.getByRole("img")).toHaveCount(0);
  });
}

test("a running task keeps updating while the owner reads an older result", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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

  const history = page.getByRole("complementary", { name: "Recent tasks" });
  await history.getByRole("button", { name: /Google Business page/ }).click();
  await expect(page.getByText("Your hours match on both pages.")).toBeVisible();

  // The running task is still followed while the owner reads another one.
  setTask("task-live", {
    status: "stopped",
    stopping: false,
    summary: "Stopped.",
    liveView: false,
  });
  await expect(
    history.getByRole("button", { name: /Find three plumbers/ }).getByText("Stopped"),
  ).toBeVisible();
  await expect(page.getByText("The task stopped.")).toBeAttached();
  await page
    .getByRole("textbox", { name: "What should your Bot do?" })
    .fill("Compare two supplier prices.");
  await expect(page.getByRole("button", { name: "Start Task" })).toBeEnabled();
});

test("a page that did not load offers a retry instead of a dead form", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockComputer(page, { status: READY, tasks: [], failFirstLoad: true });

  await page.goto("/computer");
  await expect(page.getByText("Your Bot's Computer Did Not Load")).toBeVisible();
  const history = page.getByRole("complementary", { name: "Recent tasks" });
  await expect(history.getByText("Recent tasks did not load.")).toBeVisible();
  await expect(page.getByText("The Task Did Not Start")).toHaveCount(0);
  await capture(page, info, "computer-load-retry");

  await page.getByRole("button", { name: "Retry" }).first().click();
  await history.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Your Bot's Computer Did Not Load")).toHaveCount(0);
  await expect(history.getByText("No tasks yet.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "What should your Bot do?" })
    .fill("Compare two supplier prices.");
  await expect(page.getByRole("button", { name: "Start Task" })).toBeEnabled();
});

test("an account without a paid plan sees one clear upgrade path", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
