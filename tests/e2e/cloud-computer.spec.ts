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
    currentUrl: "https://austinplumbers.example/",
    ownerControl: false,
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
    clickNavigatesTo?: string;
    /** Answer the first status and task-list reads with a server error. */
    failFirstLoad?: boolean;
  },
) {
  const replies: string[] = [];
  const stops: string[] = [];
  const ownerInputs: unknown[] = [];
  const takeovers: string[] = [];
  const returns: string[] = [];
  const starts: unknown[] = [];
  let tasks = options.tasks;
  let frame = options.frame;
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
            {
              id: "design-bot",
              name: "Front Desk",
              role: "receptionist",
              mark_key: "spark-rose",
              phone_number: "+15125550100",
            },
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
    if (path === "/api/computer/tasks" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        agentId: string;
        prepareBrowser?: boolean;
        goal?: string;
      };
      starts.push(body);
      const next = task({
        id: "task-new",
        agentId: body.agentId,
        goal: body.prepareBrowser ? "Browse first, then give your Bot a task." : (body.goal ?? ""),
        status: body.prepareBrowser ? "needs_input" : "running",
        question: body.prepareBrowser
          ? "Browse the web, then tell your Bot what to do from this browser."
          : null,
        currentUrl: null,
        frameUrl: null,
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
      const input = request.postDataJSON() as { kind?: string; url?: string; action?: string };
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
      }
      return route.fulfill({
        json: { task: tasks.find((item) => item.id === controlInputMatch[1]) },
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
      setTask(controlMatch[1], { ownerControl: true });
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
    setTask,
    setFrame: (next: Buffer | null) => {
      frame = next;
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
    await expect(page.getByRole("button", { name: "Open browser" })).toHaveCount(0);
    // The live browser owns the page until the task finishes.
    const stop = await detail.getByRole("button", { name: "Stop" }).boundingBox();
    expect(stop && stop.width > stop.height).toBe(true);
    await expect(page.locator(".wl-computer-composer")).toHaveCount(0);
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
    await expect(
      finished.getByText("The browser screen was cleared after this task ended."),
    ).toBeVisible();
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

for (const width of [390, 1440]) {
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
    await expect(detail.getByText("Front Desk · +15125550100")).toBeVisible();
    await detail.getByRole("button", { name: "Take control" }).click();
    await expect(detail.getByRole("heading", { name: "You’re in control" })).toBeVisible();
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
      .getByRole("textbox", { name: "Type into the focused page field" })
      .fill("owner@example.test");
    await detail.getByRole("button", { name: "Send to page" }).click();
    await expect(
      detail.getByRole("textbox", { name: "Type into the focused page field" }),
    ).toHaveValue("");
    await detail.getByRole("textbox", { name: "Web address" }).fill("https://login.example.test");
    await detail.getByRole("button", { name: "Go to website" }).click();
    await expect(detail.getByRole("textbox", { name: "Web address" })).toHaveValue(
      "https://login.example.test/",
    );
    await detail.getByRole("button", { name: "Back", exact: true }).click();
    await detail.getByRole("button", { name: "Tab", exact: true }).click();
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "type", text: "owner@example.test" }),
    );
    expect(ownerInputs).toContainEqual(expect.objectContaining({ kind: "key", key: "Tab" }));
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "navigate", url: "https://login.example.test" }),
    );
    expect(ownerInputs).toContainEqual(
      expect.objectContaining({ kind: "history", action: "back" }),
    );
    expect(ownerInputs.some((input) => (input as { kind?: string }).kind === "click")).toBe(true);
    await expectNoHorizontalOverflow(page);
    if (width >= 820) {
      const screenBox = await detail.locator(".wl-computer-screen").boundingBox();
      const controlsBox = await detail
        .getByRole("complementary", { name: "Browser controls" })
        .boundingBox();
      expect(
        screenBox && controlsBox && screenBox.x + screenBox.width <= controlsBox.x + 1,
        JSON.stringify({ screenBox, controlsBox }),
      ).toBe(true);
    }
    await capture(page, info, `computer-owner-control-${width}`);

    await detail.getByRole("button", { name: "Return control to Bot" }).click();
    await expect(detail.getByText("Working", { exact: true })).toBeVisible();
    expect(returns).toEqual(["task-live"]);
  });
}

for (const width of [390, 1440]) {
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
    await page.getByRole("button", { name: "Open browser" }).click();
    expect(starts).toEqual([{ agentId: "design-bot", prepareBrowser: true }]);
    const detail = page.getByRole("region", { name: "Your browser is ready" });
    await expect(detail.getByRole("heading", { name: "You’re in control" })).toBeVisible();
    await expect(
      detail.getByRole("img", {
        name: "Browser screen. Click or drag to interact with the page.",
      }),
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "Give task to Bot" })).toBeDisabled();
    await capture(page, info, `computer-browse-first-${width}-top`);
    await detail.getByRole("button", { name: "Enter a web address" }).click();
    await expect(detail.getByRole("textbox", { name: "Web address" })).toBeFocused();
    await detail.getByRole("textbox", { name: "Web address" }).fill("google.com");
    await detail.getByRole("button", { name: "Go to website" }).click();
    expect(ownerInputs).toContainEqual({ kind: "navigate", url: "google.com" });
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
  await expect(announcement).toHaveText("Your Bot finished the task.");
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
