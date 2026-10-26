import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OWNER_BROWSER_CAPABILITIES } from "../../src/lib/cloud-computer/browser-capabilities";

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

async function syntheticFrame(page: Page) {
  const frame = await page.context().newPage();
  await frame.setViewportSize({ width: 1280, height: 800 });
  await frame.setContent(
    '<body style="margin:0;background:#f9fafb;color:#1f2937;font:18px system-ui"><header style="padding:24px 40px;border-bottom:1px solid #ddd;background:white">Local services directory · Synthetic fixture</header><main style="padding:40px"><h1>Saturday plumbing services</h1><p>Harbor Plumbing — Saturday 8am–4pm</p><p>Northside Repairs — Saturday 9am–2pm</p><p>River City Plumbing — Saturday 8am–noon</p></main></body>',
  );
  const jpeg = await frame.screenshot({ type: "jpeg", quality: 80 });
  await frame.close();
  return jpeg;
}

const panelTabs = (page: Page) => page.getByRole("tablist", { name: "Workspace panel" });
const panelTab = (page: Page, name: string) =>
  panelTabs(page).getByRole("tab", { name, exact: true });
const conversation = (page: Page, botName = "Front Desk") =>
  page.getByRole("textbox", { name: `Message ${botName}`, exact: true });
const workConversation = (page: Page, botName = "Front Desk") =>
  page.getByRole("textbox", { name: `Task for ${botName}`, exact: true });

for (const width of [700, 1206]) {
  test(`Configure uses one compact composer and preserves rehearsal access at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "wireline:studio-panel:v3",
        JSON.stringify({ size: 384, collapsed: false }),
      );
    });
    const api = await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    if (width > 1180) {
      await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
    }
    const room = page.getByRole("region", { name: "Front Desk workroom", exact: true });
    const input = conversation(page);
    const dock = room.locator(".wl-studio-composer");
    const send = dock.getByRole("button", { name: "Send", exact: true });
    await expect(input).toBeVisible();
    await expect(room.locator(".wl-studio-chat__header")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Set Up view" })).toHaveCount(0);
    await expect(room.getByRole("button", { name: "Clear conversation", exact: true })).toHaveCount(
      0,
    );
    await expect(dock).toHaveCSS("display", "grid");
    const box = await dock.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(84);
    const sendBox = await send.boundingBox();
    expect(sendBox?.width).toBeGreaterThanOrEqual(44);
    expect(sendBox?.height).toBeGreaterThanOrEqual(44);
    const sendBackground = await send.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    );

    const suggestions = room.locator("details.wl-studio-starters");
    await expect(suggestions).toHaveJSProperty("open", false);
    await expect(
      suggestions.getByRole("button", { name: "Set the greeting", exact: true }),
    ).toBeHidden();
    await suggestions.getByText("Suggestions", { exact: true }).click();
    await suggestions.getByRole("button", { name: "Set the greeting", exact: true }).click();
    await expect(input).toHaveValue("Set the greeting");
    await expect(suggestions).toHaveCount(0);
    await input.fill("Keep this unsent instruction while I change views.");

    const modes = page.getByRole("group", { name: "Conversation mode" });
    await modes.getByRole("button", { name: "Work", exact: true }).click();
    const workDock = workConversation(page).locator("..");
    await expect(workDock).toHaveClass(/wl-studio-composer/);
    await expect(workDock.getByText("Supervised web work", { exact: true })).toHaveCount(0);
    await expect(workDock.getByRole("button", { name: "Start work", exact: true })).toHaveCSS(
      "background-color",
      sendBackground,
    );
    await modes.getByRole("button", { name: "Configure", exact: true }).click();
    await expect(input).toHaveValue("Keep this unsent instruction while I change views.");

    if (width < 1180) {
      await room.getByRole("button", { name: "Rehearse", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Start rehearsal", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Back to Configure", exact: true }).click();
      await expect(input).toBeFocused();
    } else {
      await panelTab(page, "Rehearse").click();
      await expect(
        page.getByRole("button", { name: "Start rehearsal", exact: true }),
      ).toBeVisible();
      await panelTab(page, "Browser").click();
    }
    await expect(input).toHaveValue("Keep this unsent instruction while I change views.");
    expect(api.starts).toEqual([]);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await proof(page, info, `configure-composer-${width}`);
  });
}

test("Configure with history keeps a usable composer and actions at 320px with enlarged text", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const api = await mockWorkspace(page);
  let sends = 0;
  let clears = 0;
  await page.route("**/api/agents/*/workspace/messages", (route) => {
    if (route.request().method() === "DELETE") {
      clears += 1;
      return route.fulfill({ json: { cleared: true } });
    }
    return route.fulfill({
      json: {
        messages: [
          {
            id: "history-1",
            role: "agent",
            content: "Your saved instructions are ready to edit.",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
  });
  await page.route("**/api/agents/*/workspace/messages/stream", (route) => {
    sends += 1;
    return route.fulfill({
      contentType: "text/event-stream",
      body: `event: done\ndata: ${JSON.stringify({
        messageId: "2",
        reply: "Review the updated instruction.",
        changes: [],
        toolToggles: [],
        actions: [],
      })}\n\n`,
    });
  });
  await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
  const room = page.getByRole("region", { name: "Front Desk workroom", exact: true });
  await expect(
    room.getByText("Your saved instructions are ready to edit.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe("32px");
  await page.evaluate(() => document.fonts.ready);
  const input = conversation(page);
  await input.scrollIntoViewIfNeeded();
  await proof(page, info, "configure-composer-history-320-enlarged");
  const dock = room.locator(".wl-studio-composer");
  const inputBox = await input.boundingBox();
  expect(inputBox?.width, JSON.stringify(inputBox)).toBeGreaterThanOrEqual(120);
  const views = page.getByRole("navigation", { name: "Workspace view" });
  const conversationBox = await views
    .getByRole("button", { name: "Configure", exact: true })
    .boundingBox();
  const browserBox = await views
    .getByRole("button", { name: "Browser", exact: true })
    .boundingBox();
  expect(conversationBox && browserBox, "Both enlarged view controls have bounds").toBeTruthy();
  expect(browserBox!.y).toBeGreaterThanOrEqual(conversationBox!.y + conversationBox!.height - 1);
  for (const name of ["Rehearse", "Clear conversation", "Send"]) {
    const control = dock.getByRole("button", { name, exact: true });
    const box = await control.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.x, name).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(321);
  }
  await expect
    .poll(() => dock.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await input.fill("Keep the owner handoff instruction.");
  await input.press("Shift+Enter");
  expect(sends).toBe(0);
  const send = dock.getByRole("button", { name: "Send", exact: true });
  await send.scrollIntoViewIfNeeded();
  await proof(page, info, "configure-composer-history-320-enlarged-actions");
  const geometryPath = info.outputPath("composer-send-geometry.json");
  await writeFile(
    geometryPath,
    JSON.stringify(
      await send.evaluate((button) => {
        const ancestors = [];
        for (let node: Element | null = button; node; node = node.parentElement) {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          ancestors.push({
            tag: node.tagName,
            className: node.className,
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
            scrollTop: node.scrollTop,
            overflowY: style.overflowY,
            scrollPaddingTop: style.scrollPaddingTop,
            scrollPaddingBottom: style.scrollPaddingBottom,
          });
        }
        return { viewport: { width: innerWidth, height: innerHeight }, ancestors };
      }),
      null,
      2,
    ),
  );
  await info.attach("composer-send-geometry", {
    contentType: "application/json",
    path: geometryPath,
  });
  await expect(send).toBeInViewport({ ratio: 1 });
  await send.click();
  await expect(room.getByText("Review the updated instruction.", { exact: true })).toBeVisible();
  expect(sends).toBe(1);
  const clear = dock.getByRole("button", { name: "Clear conversation", exact: true });
  await clear.scrollIntoViewIfNeeded();
  await expect(clear).toBeInViewport({ ratio: 1 });
  let confirmations = 0;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    confirmations += 1;
    await dialog.accept();
  });
  await clear.click();
  await expect(
    room.getByText("Your saved instructions are ready to edit.", { exact: true }),
  ).toHaveCount(0);
  await expect(room.getByText("Review the updated instruction.", { exact: true })).toHaveCount(0);
  expect(clears).toBe(1);
  expect(confirmations).toBe(1);
  expect(api.starts).toEqual([]);
});

test("completed Configure browser keeps task details collapsed and keyboard-accessible", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1206, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "wireline:studio-panel:v3",
      JSON.stringify({ size: 384, collapsed: false }),
    );
  });
  const summary = "The public directory lists three Saturday options.";
  let endedFrameRequests = 0;
  const api = await mockWorkspace(page, [
    {
      ...pastTask(
        "completed-directory",
        bots[0].id,
        "Find Saturday services in the public directory.",
        summary,
      ),
      sources: ["https://directory.example/report"],
    },
  ]);
  await page.route("**/api/computer/tasks/*/frame", (route) => {
    endedFrameRequests += 1;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Workspace panel", exact: true });
  const details = panel.locator("details.wl-computer-completed-details");
  await expect(details).toHaveJSProperty("open", false);
  await expect(panel.getByText(summary, { exact: true })).toBeHidden();
  const endedBrowser = panel.getByRole("figure", { name: "Ended browser", exact: true });
  await expect(endedBrowser).toBeVisible();
  await expect(endedBrowser.getByText("Screen cleared.", { exact: true })).toBeVisible();
  await expect(endedBrowser.getByRole("img")).toHaveCount(0);
  await expect(
    endedBrowser.getByRole("button", { name: "Open browser", exact: true }),
  ).toBeEnabled();
  const disclosure = details.locator("summary");
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(details).toHaveJSProperty("open", true);
  await expect(details.getByText(summary, { exact: true })).toBeVisible();
  await expect(
    details.getByRole("link", { name: "directory.example", exact: true }),
  ).toHaveAttribute("href", "https://directory.example/report");
  await disclosure.press("Enter");
  await expect(details).toHaveJSProperty("open", false);
  await expect(panel.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Open task activity", exact: true }),
  ).toBeVisible();
  expect(api.starts).toEqual([]);
  expect(endedFrameRequests).toBe(0);
  await expect
    .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  await proof(page, info, "configure-completed-panel-1206");
  await endedBrowser.getByRole("button", { name: "Open browser", exact: true }).click();
  await expect.poll(() => api.starts).toEqual([{ agentId: bots[0].id, prepareBrowser: true }]);
});

for (const status of ["stopped", "interrupted"] as const) {
  test(`${status} Configure browser without a report keeps its task brief readable`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1206, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "wireline:studio-panel:v3",
        JSON.stringify({ size: 384, collapsed: false }),
      );
    });
    const goal = "Check Saturday opening hours on the public directory.";
    const api = await mockWorkspace(page, [
      {
        ...pastTask(`ended-without-report-${status}`, bots[0].id, goal, ""),
        status,
        summary: null,
      },
    ]);
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Workspace panel", exact: true });
    const detail = panel.getByRole("region", { name: goal, exact: true });
    const brief = detail.locator(".wl-computer-detail__label");
    await expect(brief).toBeVisible();
    const bounds = await brief.boundingBox();
    expect(
      bounds?.width,
      "The ended task brief must be readable, not clipped to screen-reader size",
    ).toBeGreaterThan(100);
    expect(bounds?.height).toBeGreaterThanOrEqual(16);
    const details = detail.locator("details.wl-computer-completed-details");
    await expect(details).toHaveJSProperty("open", false);
    await details.locator("summary").press("Enter");
    await expect(details.getByText(goal, { exact: true })).toBeVisible();
    await expect(detail.getByRole("figure", { name: "Ended browser", exact: true })).toBeVisible();
    await expect(detail.getByRole("img")).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
    const recovery = detail.locator(".wl-computer-recovery");
    if (status === "interrupted") {
      await expect(
        recovery.getByRole("button", { name: "Set web address", exact: true }),
      ).toBeVisible();
    } else {
      await expect(recovery.getByRole("button")).toHaveCount(0);
    }
    await expect(page.locator("textarea:visible")).toHaveCount(1);
    await expect(detail.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Open task activity", exact: true }),
    ).toBeVisible();
    expect(api.starts).toEqual([]);
    await proof(page, info, `configure-${status}-without-report`);
  });
}

test("ended Configure browser keeps three actions and an unsent draft reachable at 320px enlarged text", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const goal = "Review the completed public listing.";
  const fixture = await mockWorkspace(page, [
    pastTask("ended-draft", bots[0].id, goal, "The listing was checked."),
  ]);
  let frameRequests = 0;
  await page.route("**/api/computer/tasks/*/frame", (route) => {
    frameRequests += 1;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`/studio?agent=${bots[0].id}&panel=computer&chat=setup`);
  await expect(page.getByRole("region", { name: goal, exact: true })).toBeVisible();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "32px", "important"),
  );
  await page.evaluate(() => document.fonts.ready);
  const detail = page.getByRole("region", { name: goal, exact: true });
  for (const name of ["New task", "Tasks", "Open task activity"]) {
    const control = detail.getByRole("button", { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    // Chromium rounds nested scroll offsets to whole pixels. Allow at most
    // half a vertical pixel (observed: 0.109px), not a clipped control.
    await expect(control).toBeInViewport({ ratio: 1 - 0.5 / box.height });
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  const newTask = detail.getByRole("button", { name: "New task", exact: true });
  await newTask.focus();
  await newTask.press("Enter");
  const input = page.getByRole("textbox", { name: "What should your Bot do?", exact: true });
  await expect(input).toBeFocused();
  await input.fill("Keep this separate, unsent browser task.");
  await page
    .getByRole("textbox", { name: "Web address", exact: true })
    .fill("https://directory.example/");
  const ended = detail.getByRole("figure", { name: "Ended browser", exact: true });
  await expect(ended).toBeAttached();
  await expect(ended.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open browser", exact: true })).toHaveCount(1);
  await expect(page.getByLabel("New browser", { exact: true })).toHaveCount(0);
  await expect(page.locator(".wl-computer-launch-browser__canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tasks", exact: true })).toHaveCount(1);
  const back = page.getByRole("button", { name: "Back to task", exact: true });
  await expect(back).toHaveCount(1);
  await back.scrollIntoViewIfNeeded();
  const backBox = (await back.boundingBox())!;
  await expect(back).toBeInViewport({ ratio: 1 - 0.5 / backBox.height });
  await back.click();
  await expect(input).toHaveCount(0);
  await expect(newTask).toBeFocused();
  await newTask.click();
  await expect(input).toHaveValue("Keep this separate, unsent browser task.");
  await expect(page.getByRole("textbox", { name: "Web address", exact: true })).toHaveValue(
    "https://directory.example/",
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect
    .poll(() => detail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  expect(fixture.starts).toEqual([]);
  expect(frameRequests).toBe(0);
  await proof(page, info, "browser-primary-terminal-draft-320-enlarged");
});

for (const width of [1206, 390, 320]) {
  test(`Browser panel keeps its live canvas ahead of long task details at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 900 : 1000 });
    const now = new Date().toISOString();
    const goal =
      `Compare public service listings. ${"Read opening hours, availability, location, and prices. ".repeat(35)}`
        .slice(0, 1980)
        .trim();
    const question = "Confirm which public listing should be used before continuing. "
      .repeat(15)
      .trim();
    const active = {
      ...pastTask("primary-browser-active", bots[0].id, goal, ""),
      status: "needs_input",
      summary: null,
      finishedAt: null,
      liveView: true,
      currentUrl: "https://directory.example/",
      question,
      events: [{ at: now, kind: "question", text: "Which public listing should I use?" }],
    };
    const older = {
      ...pastTask(
        "primary-browser-old",
        bots[0].id,
        "Earlier listing research",
        "Earlier verified result.",
      ),
      sources: ["https://directory.example/earlier"],
    };
    const frame = await syntheticFrame(page);
    const fixture = await mockWorkspace(page, [active, older], frame);
    const frameTaskIds: string[] = [];
    await page.route("**/api/computer/tasks/*/frame", (route) => {
      frameTaskIds.push(new URL(route.request().url()).pathname.split("/").at(-2)!);
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: frame });
    });
    await page.goto(`/studio?agent=${bots[0].id}&panel=computer&chat=setup`);
    if (width >= 1180)
      await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
    if (width === 320) {
      await page.evaluate(() =>
        document.documentElement.style.setProperty("font-size", "32px", "important"),
      );
      await page.evaluate(() => document.fonts.ready);
    }
    const detail = page.getByRole("region", { name: goal, exact: true });
    const image = detail.getByRole("img", {
      name: "What your Bot's cloud computer shows right now",
      exact: true,
    });
    await expect(image).toBeVisible();
    const label = detail.locator(".wl-computer-detail__label");
    expect(Array.from((await label.textContent()) || "").length).toBeLessThanOrEqual(80);
    const imageBox = (await image.boundingBox())!;
    const questionBox = (await detail.locator(".wl-computer-question").boundingBox())!;
    expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(questionBox.y);
    await expect(detail.locator("details.wl-computer-completed-details")).toHaveJSProperty(
      "open",
      false,
    );
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect
      .poll(() => detail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
      .toBe(true);
    for (const name of ["Tasks", "Open task activity"]) {
      const button = detail.getByRole("button", { name, exact: true });
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await proof(page, info, `browser-primary-live-${width}${width === 320 ? "-enlarged" : ""}`);
    const tasksAction = detail.getByRole("button", { name: "Tasks", exact: true });
    if (width === 1206) {
      await detail.getByRole("button", { name: "Enter browser fullscreen", exact: true }).click();
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    }
    await tasksAction.focus();
    await expect(tasksAction).toBeFocused();
    await tasksAction.press("Enter");
    const history = page.getByRole("dialog", { name: "Recent Tasks", exact: true });
    await expect(history).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(tasksAction).toBeFocused();
    await tasksAction.press("Enter");
    await history.getByRole("button", { name: older.goal, exact: true }).click();
    const preview = history.getByRole("article", { name: older.goal, exact: true });
    await preview.locator("details > summary").press("Enter");
    await expect(preview.getByText(older.summary, { exact: true })).toBeVisible();
    await expect(
      preview.getByRole("link", { name: "directory.example", exact: true }),
    ).toHaveAttribute("href", older.sources[0]);
    // Radix hides the background from accessibility queries while its modal
    // owns focus. Inspect only attachment through that hidden background;
    // the normal visible-image locator is checked again after closing it.
    const backgroundImage = page
      .getByRole("region", { name: goal, exact: true, includeHidden: true })
      .getByRole("img", {
        name: "What your Bot's cloud computer shows right now",
        exact: true,
        includeHidden: true,
      });
    await expect(backgroundImage).toBeAttached();
    await expect(backgroundImage).toHaveAttribute("src", /^blob:/);
    await expect(preview.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    await history.getByRole("button", { name: "Close", exact: true }).click();
    await expect(tasksAction).toBeFocused();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeInViewport({ ratio: 1 });
    expect(frameTaskIds.length).toBeGreaterThan(0);
    expect(frameTaskIds.every((id) => id === active.id)).toBe(true);
    await detail.getByRole("button", { name: "Stop", exact: true }).click();
    expect(fixture.stops).toEqual([active.id]);
    expect(fixture.starts).toEqual([]);
  });
}

test.describe("wide screens", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Knowledge and the Browser shortcut retain the selected Bot under Workspace", async ({
    page,
  }) => {
    const fixture = await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[1].id}`);
    const rail = page.getByRole("complementary", { name: "Workspace navigation", exact: true });
    await rail.getByRole("link", { name: "Knowledge", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/knowledge\\?agent=${bots[1].id}$`));
    await expect(page.getByRole("combobox", { name: "Choose Bot", exact: true })).toHaveValue(
      bots[1].id,
    );
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(rail.getByRole("link", { name: "Knowledge", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rail.getByRole("link", { name: "Computer", exact: true })).toHaveCount(0);
    await page.getByRole("heading", { name: "Knowledge", exact: true }).click();
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect(page).toHaveURL(new RegExp(`/studio\\?panel=computer&agent=${bots[1].id}$`));
    await expect(rail.getByRole("link", { name: "Workspace", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Switch Bot", exact: true })).toHaveValue(
      bots[1].id,
    );
    await page.reload();
    await expect(rail.getByRole("link", { name: "Workspace", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await panelTabs(page).getByRole("tab", { name: "Rehearse", exact: true }).click();
    await expect(rail.getByRole("link", { name: "Workspace", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
    expect(fixture.starts).toEqual([]);
  });

  test("navigation starts readable and remembers the owner's compact preference", async ({
    page,
  }, testInfo) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);

    const rail = page.getByRole("complementary", { name: "Workspace navigation", exact: true });
    const collapse = rail.getByRole("button", { name: "Collapse navigation", exact: true });
    await expect(collapse).toHaveAttribute("aria-expanded", "true", { timeout: 20_000 });
    expect((await rail.boundingBox())!.width).toBeGreaterThan(200);
    await expect(rail.getByText("Calendar", { exact: true })).toBeVisible();
    await collapse.click();
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

    await page.reload();
    await expect(expand).toBeVisible();
    expect((await rail.boundingBox())!.width).toBeLessThan(80);
    await expand.click();
    await expect(collapse).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("Workspace opens the browser beside chat and keeps rehearsal one tab away", async ({
    page,
  }, testInfo) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);

    const rail = page.getByRole("complementary", { name: "Workspace navigation", exact: true });
    await expect(rail.getByRole("link", { name: "Knowledge", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeHidden();
    await expect(panelTabs(page).getByRole("tab")).toHaveText([
      "Browser",
      "Rehearse",
      "Set Up",
      "Summary",
    ]);
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");

    // Changing the Bot and trying it are on screen together.
    await expect(workConversation(page)).toBeVisible();
    const panel = page.getByRole("complementary", { name: "Workspace panel" });
    await expect(panel.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
    await page
      .getByRole("group", { name: "Conversation mode" })
      .getByRole("button", { name: "Configure", exact: true })
      .click();
    await panelTab(page, "Rehearse").click();
    await expect(panel.getByRole("button", { name: "Typed", exact: true })).toHaveCount(0);
    await expect(
      panel.getByRole("textbox", { name: "Customer message for Front Desk", exact: true }),
    ).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Start rehearsal", exact: true })).toBeVisible();
    await expect(conversation(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace-try-it.png") });

    await panelTab(page, "Browser").click();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByLabel("What should your Bot do?")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
    // The panel's computer belongs to the Bot being set up; no second Bot picker.
    await expect(panel.locator("#computer-agent")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
    await expect(conversation(page)).toBeVisible();
    await expect(page.locator("textarea:visible")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("workspace-computer-panel.png") });

    // Full width takes the Workspace and gives it back without losing a draft.
    await conversation(page).fill("Keep this unsent instruction.");
    const fullWidth = page.getByRole("button", { name: /^(Expand panel|Restore split view)$/ });
    await fullWidth.click();
    await expect(fullWidth).toHaveAttribute("aria-pressed", "true");
    await expect(conversation(page)).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize workspace panel" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("workspace-computer-full-width.png") });
    await fullWidth.press("Escape");
    await expect(fullWidth).toHaveAttribute("aria-pressed", "false");
    await expect(fullWidth).toHaveAccessibleName("Expand panel");
    await expect(fullWidth).toBeFocused();
    await expect(conversation(page)).toHaveValue("Keep this unsent instruction.");

    // The panel returns to the last tab the owner used.
    await page.reload();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true", {
      timeout: 20_000,
    });

    // Close hands the width back without adding another mode header.
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(panelTabs(page)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Set Up view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rehearse", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
    await expect(panelTab(page, "Set Up")).toHaveAttribute("aria-selected", "true");
  });

  test("a focused browser restores split view even after a saved panel close", async ({ page }) => {
    await mockWorkspace(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "wireline:studio-panel:v3",
        JSON.stringify({ size: 520, collapsed: true }),
      );
    });
    await page.goto(`/studio?agent=${bots[0].id}&focus=computer`);
    const panel = page.getByRole("complementary", { name: "Workspace panel", exact: true });
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(workConversation(page)).toBeHidden();
    await panel.getByRole("button", { name: "Restore split view", exact: true }).click();
    await expect(workConversation(page)).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("separator", { name: "Resize workspace panel" })).toHaveAttribute(
      "aria-valuenow",
      "520",
    );
    await expect(page).not.toHaveURL(/focus=computer/);
  });

  test("an expanded panel leaves Escape to an owner input field", async ({ page }) => {
    const task = {
      ...pastTask("owner-input", bots[0].id, "Inspect a synthetic sign-in page.", ""),
      status: "needs_input",
      ownerControl: true,
      liveView: true,
      question: "Sign in, then return control.",
    };
    await mockWorkspace(page, [task]);
    await page.goto(`/studio?agent=${bots[0].id}`);
    await page.getByRole("button", { name: "Expand panel", exact: true }).click();
    const ownerInput = page.getByLabel("Type into selected field", { exact: true });
    await ownerInput.fill("synthetic local draft");
    await ownerInput.press("Escape");
    await expect(ownerInput).toHaveValue("synthetic local draft");
    await expect(
      page.getByRole("button", { name: "Restore split view", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(workConversation(page)).toBeHidden();
    await page.getByRole("tab", { name: "Browser", exact: true }).focus();
    await page.getByRole("tab", { name: "Browser", exact: true }).press("Escape");
    await expect(workConversation(page)).toBeVisible();
    await expect(ownerInput).toHaveValue("synthetic local draft");
    await expect(page.getByRole("button", { name: "Expand panel", exact: true })).toBeFocused();
  });

  test("the 384px inspector keeps normal tabs on one row and enlarged controls reachable", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    const panel = page.getByRole("complementary", { name: "Workspace panel", exact: true });
    const separator = page.getByRole("separator", { name: "Resize workspace panel" });
    await expect(separator).toBeVisible({ timeout: 20_000 });
    await separator.focus();
    await separator.press("Home");
    await expect
      .poll(
        async () =>
          (await page.locator('[data-wireline-resizable-panel="right"]').boundingBox())!.width,
      )
      .toBe(384);
    await page.evaluate(() => document.fonts.ready);
    const header = panel.locator(".wl-studio-panel-header");
    const geometry = () =>
      header.evaluate((element) => {
        const controls = [...element.querySelectorAll<HTMLElement>("button")];
        const bounds = element.getBoundingClientRect();
        const rects = controls.map((control) => control.getBoundingClientRect());
        return {
          centers: rects.map((rect) => rect.top + rect.height / 2),
          heights: rects.map((rect) => rect.height),
          outsideHeader: rects.filter(
            (rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1,
          ).length,
          overflow: [element, ...element.querySelectorAll<HTMLElement>("[role='tablist'], button")]
            .filter((control) => control.scrollWidth > control.clientWidth + 1)
            .map((control) => control.textContent),
        };
      });
    await expect
      .poll(async () => {
        const { centers } = await geometry();
        return Math.max(...centers) - Math.min(...centers);
      })
      .toBeLessThanOrEqual(1);
    const normal = await geometry();
    expect(normal.centers).toHaveLength(6);
    expect(normal.heights.every((height) => height >= 44)).toBe(true);
    expect(normal.outsideHeader).toBe(0);
    expect(normal.overflow).toEqual([]);
    await page.screenshot({ path: info.outputPath("workspace-panel-384.png") });

    await page.evaluate(() =>
      document.documentElement.style.setProperty("font-size", "32px", "important"),
    );
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe("32px");
    await page.evaluate(() => document.fonts.ready);
    for (const name of ["Browser", "Rehearse", "Set Up", "Summary"])
      await expect(panelTab(page, name)).toBeVisible();
    await panelTab(page, "Browser").focus();
    await panelTab(page, "Browser").press("End");
    await expect(panelTab(page, "Summary")).toBeFocused();
    await expect(panelTab(page, "Summary")).toHaveAttribute("aria-selected", "true");
    await panelTab(page, "Summary").press("Home");
    await expect(panelTab(page, "Browser")).toBeFocused();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("button", { name: "Expand panel", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Close panel", exact: true }).focus();
    await expect(panel.getByRole("button", { name: "Close panel", exact: true })).toBeFocused();
    const enlarged = await geometry();
    expect(enlarged.heights.every((height) => height >= 44)).toBe(true);
    expect(enlarged.outsideHeader).toBe(0);
    expect(enlarged.overflow).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("workspace-panel-384-enlarged.png") });
  });

  test("dragging widens the panel but never squeezes the conversation", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    const separator = page.getByRole("separator", { name: "Resize workspace panel" });
    await expect(separator).toBeVisible({ timeout: 20_000 });
    const panel = page.getByRole("complementary", { name: "Workspace panel" });
    const before = (await panel.boundingBox())!.width;

    await separator.focus();
    await page.keyboard.press("End");
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 100);
    const composer = (await workConversation(page).boundingBox())!;
    expect(composer.width).toBeGreaterThanOrEqual(300);

    await page.keyboard.press("Home");
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThan(before);
  });

  test("Browser drafts survive responsive remounts without a duplicate desktop composer", async ({
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
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    await conversation(page).fill("Keep my configuration instruction.");
    await panelTab(page, "Browser").click();
    await expect(page.getByRole("figure", { name: "Ended browser", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tasks", exact: true })).toHaveCount(1);
    const goal = page.getByLabel("What should your Bot do?", { exact: true });
    const url = page.getByLabel("Web address", { exact: true });
    await expect(goal).toHaveCount(0);
    await expect(page.locator("textarea:visible")).toHaveCount(1);

    // On phones the full-width Browser owns the sole task input. Opening its
    // draft form must not be confused with Open browser, which starts work.
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("navigation", { name: "Workspace view" })
      .getByRole("button", { name: "Browser", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/studio" && url.searchParams.get("panel") === "computer",
    );
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await expect(goal).toHaveValue("");
    await goal.fill("Read the public Calls Regular monthly price.");
    await url.fill("https://botbound.app/pricing");
    await expect(page.locator("textarea:visible")).toHaveCount(1);
    await page.getByLabel("Switch Bot", { exact: true }).selectOption(bots[1].id);
    await expect(page.getByText("The previous task is complete.", { exact: true })).toHaveCount(0);
    await expect(goal).toHaveValue("");
    await expect(url).toHaveValue("");
    await page.getByLabel("Switch Bot", { exact: true }).selectOption(bots[0].id);
    await expect(goal).toHaveValue("Read the public Calls Regular monthly price.");
    await expect(url).toHaveValue("https://botbound.app/pricing");

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(goal).toHaveCount(0);
    await expect(conversation(page)).toHaveValue("Keep my configuration instruction.");
    await expect(url).toHaveValue("https://botbound.app/pricing");
    await expect(page.locator("textarea:visible")).toHaveCount(1);
    await panelTab(page, "Summary").click();
    await panelTab(page, "Browser").click();
    await expect(goal).toHaveCount(0);
    await expect(conversation(page)).toHaveValue("Keep my configuration instruction.");
    await expect(url).toHaveValue("https://botbound.app/pricing");
    await expect(page.getByRole("button", { name: "Back to task", exact: true })).toBeVisible();
    expect(taskStarts).toBe(0);
  });

  for (const hasSalesHistory of [false, true]) {
    test(`a pinned Browser uses its Bot's history after switching Bots (${hasSalesHistory ? "with" : "without"} history)`, async ({
      page,
    }) => {
      const front = pastTask(
        "front-history",
        bots[0].id,
        "Front Desk previous research",
        "Front Desk's earlier result.",
      );
      const sales = pastTask(
        "sales-history",
        bots[1].id,
        "Sales previous research",
        "Sales Bot's earlier result.",
      );
      await mockWorkspace(page, hasSalesHistory ? [front, sales] : [front]);
      await page.goto(`/studio?agent=${bots[0].id}`);
      const browser = page.getByRole("complementary", { name: "Workspace panel", exact: true });
      await expect(browser.getByRole("region", { name: front.goal, exact: true })).toBeVisible();
      await page
        .getByRole("combobox", { name: "Switch Bot", exact: true })
        .selectOption(bots[1].id);
      await expect(workConversation(page, "Sales Bot")).toBeVisible();
      await expect(browser.getByRole("region", { name: front.goal, exact: true })).toHaveCount(0);
      if (hasSalesHistory) {
        await expect(browser.getByRole("region", { name: sales.goal, exact: true })).toBeVisible();
        await expect(
          page
            .getByRole("log", { name: "Work conversation" })
            .getByText(sales.summary, { exact: true }),
        ).toBeVisible();
      } else {
        await expect(browser.getByRole("region")).toHaveCount(0);
        await expect(
          browser.getByRole("button", { name: "Open browser", exact: true }),
        ).toBeEnabled();
      }
      await browser.getByRole("button", { name: "Tasks", exact: true }).click();
      const history = page.getByRole("dialog", { name: "Recent Tasks", exact: true });
      await expect(history.getByRole("button", { name: new RegExp(front.goal) })).toHaveCount(0);
      if (hasSalesHistory)
        await expect(history.getByRole("button", { name: new RegExp(sales.goal) })).toBeVisible();
      else await expect(history.getByText("No tasks yet.", { exact: true })).toBeVisible();
      await history.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Switch Bot", exact: true })
        .selectOption(bots[0].id);
      await expect(browser.getByRole("region", { name: front.goal, exact: true })).toBeVisible();
    });
  }

  test("another Bot's live browser is explicit and cannot become foreign history after completion", async ({
    page,
  }) => {
    const front = {
      ...pastTask("front-active", bots[0].id, "Front Desk active research", ""),
      status: "running",
      summary: null,
      finishedAt: null,
    };
    const previousFront = pastTask(
      "front-history",
      bots[0].id,
      "Front Desk old research",
      "Front Desk's old result.",
    );
    const sales = pastTask(
      "sales-history",
      bots[1].id,
      "Sales previous research",
      "Sales Bot's earlier result.",
    );
    const fixture = await mockWorkspace(page, [front, previousFront, sales]);
    await page.goto(`/studio?agent=${bots[0].id}`);
    const browser = page.getByRole("complementary", { name: "Workspace panel", exact: true });
    await expect(browser.getByRole("region", { name: front.goal, exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption(bots[1].id);
    await expect(browser.getByText("Front Desk's active browser", { exact: true })).toBeVisible();
    await expect(
      browser.getByRole("link", { name: "Switch to Front Desk", exact: true }),
    ).toHaveAttribute("href", `/studio?agent=${bots[0].id}&panel=computer`);
    await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
    await browser.getByRole("link", { name: "Switch to Front Desk", exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/studio" &&
        url.searchParams.get("agent") === bots[0].id &&
        url.searchParams.get("panel") === "computer",
    );
    await expect(browser).toBeVisible();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(workConversation(page, "Front Desk")).toBeVisible();
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption(bots[1].id);
    await expect(browser.getByText("Front Desk's active browser", { exact: true })).toBeVisible();
    await browser.getByRole("button", { name: "Tasks", exact: true }).click();
    const history = page.getByRole("dialog", { name: "Recent Tasks", exact: true });
    await expect(history.getByRole("button", { name: new RegExp(previousFront.goal) })).toHaveCount(
      0,
    );
    await expect(history.getByRole("button", { name: new RegExp(front.goal) })).toBeVisible();
    await history.getByRole("button", { name: new RegExp(sales.goal) }).click();
    const preview = history.getByRole("article", { name: sales.goal, exact: true });
    await expect(preview).toBeVisible();
    await preview.locator("details > summary").press("Enter");
    await expect(preview.getByText(sales.summary, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: front.goal, exact: true, includeHidden: true }),
    ).toBeAttached();
    await history.getByRole("button", { name: "Close", exact: true }).click();
    await expect(browser.getByText("Front Desk's active browser", { exact: true })).toBeVisible();
    fixture.setTask(front.id, {
      status: "completed",
      summary: "Front Desk finished.",
      finishedAt: new Date().toISOString(),
    });
    await expect(browser.getByText("Front Desk's active browser", { exact: true })).toHaveCount(0);
    await expect(browser.getByRole("region", { name: front.goal, exact: true })).toHaveCount(0);
    await expect(browser.getByRole("region", { name: sales.goal, exact: true })).toBeVisible();
  });

  for (const expired of [false, true]) {
    test(`the Browser offers ${expired ? "session-ended" : "generic"} recovery from a confirmed failure`, async ({
      page,
    }) => {
      const fixture = await mockWorkspace(page, [
        {
          ...pastTask(
            "failed-browser",
            bots[0].id,
            "Read the public listing.",
            "Diagnostic text is not recovery guidance.",
          ),
          status: "failed",
          errorCode: expired ? "COMPUTER_BROWSER_EXPIRED" : "COMPUTER_UNKNOWN_FAILURE",
        },
      ]);
      await page.goto(`/studio?agent=${bots[0].id}`);
      const browser = page.getByRole("complementary", { name: "Workspace panel", exact: true });
      const recovery = browser.locator(".wl-computer-recovery");
      await expect(
        recovery.getByText(expired ? "Session expired." : "This task stopped before it finished.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(recovery).not.toContainText("Diagnostic text");
      const addressAction = recovery.getByRole("button", { name: "Set web address", exact: true });
      await addressAction.focus();
      await expect(addressAction).toBeFocused();
      await addressAction.press("Enter");
      const ended = browser.getByRole("figure", { name: "Ended browser", exact: true });
      await expect(ended).toBeVisible();
      await expect(ended.getByText("Browser session ended", { exact: true })).toBeVisible();
      await expect(ended.getByText("Screen cleared.", { exact: true })).toBeVisible();
      await expect(ended.getByRole("img")).toHaveCount(0);
      const open = browser.getByRole("button", { name: "Open browser", exact: true });
      await expect(open).toHaveCount(1);
      await expect(open).toBeEnabled();
      await expect(browser.getByLabel("New browser", { exact: true })).toHaveCount(0);
      const address = browser.getByRole("textbox", { name: "Web address", exact: true });
      await address.fill("https://directory.example/recovery");
      expect(fixture.starts).toEqual([]);
      const back = browser.getByRole("button", { name: "Back to task", exact: true });
      await back.focus();
      await back.press("Enter");
      await expect(address).toHaveCount(0);
      await expect(addressAction).toBeFocused();
      await addressAction.press("Enter");
      await expect(address).toHaveValue("https://directory.example/recovery");
      expect(fixture.starts).toEqual([]);
      await open.click();
      await expect
        .poll(() => fixture.starts)
        .toEqual([
          {
            agentId: bots[0].id,
            prepareBrowser: true,
            startUrl: "https://directory.example/recovery",
          },
        ]);
    });
  }

  test("closing and reopening the browser preserves the conversation draft", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[1].id}&chat=setup`);
    await conversation(page, "Sales Bot").fill("Keep this while the computer opens.");
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Workspace view" })
      .getByRole("button", { name: "Browser", exact: true })
      .click();
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Expand panel", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(conversation(page, "Sales Bot")).toHaveValue(
      "Keep this while the computer opens.",
    );
  });

  test("Computer links open beside the conversation on wide screens", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/computer?agent=${bots[1].id}`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/studio" &&
        url.searchParams.get("agent") === bots[1].id &&
        !url.searchParams.has("focus"),
      { timeout: 20_000 },
    );
    await expect(panelTab(page, "Browser")).toHaveAttribute("aria-selected", "true", {
      timeout: 20_000,
    });
    await expect(workConversation(page, "Sales Bot")).toBeVisible();
  });

  test("a Try It link brings rehearsal forward over the computer", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    await panelTab(page, "Browser").click();
    await page.goto(`/studio?agent=${bots[0].id}&workroom=test`);
    await expect(panelTab(page, "Rehearse")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Knowledge lives in More and preserves the Bot without a duplicate workspace tab", async ({
    page,
  }) => {
    const run = await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}`);
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toHaveCount(0);
    await page.getByRole("button", { name: "More destinations" }).click();
    await page.getByRole("link", { name: "Knowledge", exact: true }).click();
    await expect(page).toHaveURL(`/knowledge?agent=${bots[0].id}`);
    await expect(page.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toHaveCount(0);
    expect(run.starts).toEqual([]);
  });

  test("mobile Configure and Browser preserve both drafts without starting work", async ({
    page,
  }) => {
    await mockWorkspace(page);
    await page.goto(`/studio?agent=${bots[0].id}&chat=setup`);
    await expect(page.getByRole("group", { name: "Set Up view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rehearse", exact: true })).toBeVisible();
    await expect(panelTabs(page)).toHaveCount(0);
    await conversation(page).fill("Keep this instruction while I browse.");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);

    await page
      .getByRole("navigation", { name: "Workspace view" })
      .getByRole("button", { name: "Browser", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/studio" && url.searchParams.get("panel") === "computer",
    );
    await expect(page.getByLabel("What should your Bot do?")).toBeVisible();
    await page.getByLabel("What should your Bot do?").fill("Compare suppliers.");
    await page
      .getByRole("navigation", { name: "Workspace view" })
      .getByRole("button", { name: "Configure", exact: true })
      .click();
    await expect(conversation(page)).toHaveValue("Keep this instruction while I browse.");
    await page
      .getByRole("navigation", { name: "Workspace view" })
      .getByRole("button", { name: "Browser", exact: true })
      .click();
    await expect(page.getByLabel("What should your Bot do?")).toHaveValue("Compare suppliers.");
  });
});

for (const width of [1440, 390]) {
  test(`Work chat runs a real task API flow and preserves checkpoint scope at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    test.setTimeout(60_000);
    const now = new Date().toISOString();
    const older = {
      id: "older-task",
      agentId: bots[0].id,
      goal: "Old reference job",
      status: "completed",
      summary: "An earlier result.",
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
    const fixture = await mockWorkspace(page, [older], await syntheticFrame(page));
    await page.goto(`/studio?agent=${bots[0].id}`);
    await expect(
      page
        .getByRole("group", { name: "Conversation mode" })
        .getByRole("button", { name: "Work", exact: true }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
    await workConversation(page).fill("Find three plumbers with Saturday hours.");
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect
      .poll(() => fixture.starts)
      .toEqual([{ agentId: bots[0].id, goal: "Find three plumbers with Saturday hours." }]);
    if (width < 1000)
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Work", exact: true })
        .click();
    await expect(page.locator(".wl-work-current-step")).toContainText(
      "Reading the public directory.",
    );
    if (width > 1000)
      await expect(
        page.getByRole("img", { name: "What your Bot's cloud computer shows right now" }),
      ).toBeVisible();
    await proof(page, info, `work-running-${width}`);
    if (width < 1000) {
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Browser", exact: true })
        .click();
      await expect(
        page.getByRole("img", { name: "What your Bot's cloud computer shows right now" }),
      ).toBeVisible();
      await proof(page, info, `work-browser-${width}`);
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Work", exact: true })
        .click();
    }
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption(bots[1].id);
    await expect(page.getByText("Front Desk is working", { exact: true })).toBeVisible();
    await workConversation(page, "Sales Bot").fill("Keep this separate Sales draft.");
    await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption(bots[0].id);
    fixture.setTask("work-task-1", {
      status: "needs_input",
      question: "Should I include the nearby suburbs?",
    });
    const reply = page.getByRole("textbox", { name: "Reply to Front Desk", exact: true });
    await expect(reply).toBeVisible();
    await proof(page, info, `work-checkpoint-${width}`);
    if (width > 1000) {
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Recent Tasks" })
        .getByRole("button", { name: /Old reference job/ })
        .click();
      await expect(
        page.getByRole("article", { name: "Old reference job", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("dialog", { name: "Recent Tasks" })
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(
        page
          .getByRole("log", { name: "Work conversation" })
          .getByText("Should I include the nearby suburbs?", { exact: true }),
      ).toBeVisible();
      await expect(reply).toBeVisible();
    }
    fixture.setTask("work-task-1", {
      ownerControl: true,
      browserCapabilities: OWNER_BROWSER_CAPABILITIES,
      ownerTabs: [{ id: "tab-1", label: "Directory", active: true }],
      ownerHistory: [
        {
          id: 1,
          tabId: "tab-1",
          label: "Local directory",
          url: "https://directory.example/",
          visitedAt: now,
        },
      ],
      ownerDownloads: [],
      ownerSavedLogins: [],
    });
    if (width < 1000)
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Browser", exact: true })
        .click();
    await expect(page.getByLabel("Type into selected field", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open browser tools", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Browser tools" })).toBeVisible();
    await proof(page, info, `work-browser-tools-${width}`);
    await page.keyboard.press("Escape");
    fixture.setTask("work-task-1", { ownerControl: false });
    if (width < 1000)
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Work", exact: true })
        .click();
    await expect(reply).toBeVisible();
    // Hold a pre-reply poll: its older checkpoint must not overwrite the confirmed reply.
    let releasePoll: () => void = () => undefined;
    let held = false;
    const gate = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    await page.route("**/api/computer/tasks/work-task-1", async (route) => {
      if (held) return route.fallback();
      held = true;
      const old = structuredClone(fixture.getTask("work-task-1"));
      await gate;
      return route.fulfill({ json: { task: old } });
    });
    await expect.poll(() => held).toBe(true);
    await reply.fill("Yes, include nearby suburbs.");
    await page.getByRole("button", { name: "Reply to Bot", exact: true }).click();
    await expect.poll(() => fixture.replies).toEqual([{ message: "Yes, include nearby suburbs." }]);
    releasePoll();
    if (width < 1000)
      await page
        .getByRole("navigation", { name: "Workspace view" })
        .getByRole("button", { name: "Work", exact: true })
        .click();
    await expect(reply).toHaveCount(0);
    await expect(page.locator(".wl-work-current-step")).toBeVisible();
    if (width > 1000) {
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Recent Tasks" })
        .getByRole("button", { name: /Old reference job/ })
        .click();
    }
    fixture.setTask("work-task-1", {
      status: "completed",
      summary:
        "**Three options**\n\n- Harbor Plumbing: Saturday 8am–4pm\n- Northside Repairs: Saturday 9am–2pm\n- River City Plumbing: Saturday 8am–noon\n\nHours came from the linked directory.",
      sources: ["https://directory.example/"],
      liveView: false,
      finishedAt: new Date().toISOString(),
    });
    await expect(
      page
        .getByRole("log", { name: "Work conversation" })
        .getByText("Three options", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Task sources" }).getByRole("link"),
    ).toHaveAttribute("href", "https://directory.example/");
    if (width > 1000)
      await page
        .getByRole("dialog", { name: "Recent Tasks", exact: true })
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await proof(page, info, `work-result-${width}`);
    await page.getByRole("combobox", { name: "Switch Bot", exact: true }).selectOption(bots[1].id);
    await expect(workConversation(page, "Sales Bot")).toHaveValue(
      "Keep this separate Sales draft.",
    );
    expect(fixture.starts).toHaveLength(1);
  });
}

test("Work follows a long result and preserves the owner's manual reading position", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = new Date().toISOString();
  const events = Array.from({ length: 40 }, (_, index) => ({
    at: now,
    kind: "action",
    text: `Reviewing public source ${index + 1} and checking its listed hours.`,
  }));
  const fixture = await mockWorkspace(page, [
    {
      id: "reading-task",
      agentId: bots[0].id,
      goal: `Compare the public directory listings. ${"Review each public source, its hours, service area, and booking requirements. ".repeat(15)}`,
      status: "running",
      summary: null,
      question: null,
      sources: [],
      events,
      turnCount: 2,
      actionCount: 40,
      startedAt: now,
      finishedAt: null,
      updatedAt: now,
      liveView: false,
    },
  ]);
  await page.goto(`/studio?agent=${bots[0].id}`);
  const log = page.getByRole("log", { name: "Work conversation" });
  await expect(
    page
      .locator(".wl-computer-completed-details > summary")
      .getByText("Task details", { exact: true }),
  ).toBeVisible();
  await log.getByText("40 browser actions", { exact: false }).click();
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight > node.clientHeight + 300))
    .toBe(true);
  await log.evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event("scroll"));
  });
  const nextEvent = { at: now, kind: "action", text: "Final source has been checked." };
  fixture.setTask("reading-task", { events: [...events, nextEvent], actionCount: 41 });
  await expect(log.getByText("41 browser actions", { exact: false })).toBeVisible();
  expect(await log.evaluate((node) => node.scrollTop)).toBeLessThan(10);
  await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(3);
  fixture.setTask("reading-task", {
    status: "completed",
    liveView: false,
    finishedAt: new Date().toISOString(),
    summary: Array.from(
      { length: 35 },
      (_, index) => `- Listing ${index + 1}: verified hours and a public source.`,
    ).join("\n"),
  });
  await expect(
    log.getByText("Listing 35: verified hours and a public source.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(3);
});

for (const receipt of ["unknown", "wrong-goal"] as const) {
  test(`Work keeps a draft after a ${receipt} success and refreshes the actual task before retry`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = await mockWorkspace(page);
    let starts = 0;
    await page.route("**/api/computer/tasks", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      starts += 1;
      const now = new Date().toISOString();
      fixture.addTask({
        id: "uncertain-task",
        agentId: bots[0].id,
        goal: "Read the current public hours.",
        status: "running",
        summary: null,
        question: null,
        sources: [],
        events: [],
        turnCount: 0,
        actionCount: 0,
        startedAt: now,
        finishedAt: null,
        updatedAt: now,
        liveView: false,
      });
      return route.fulfill({
        json:
          receipt === "unknown"
            ? { success: true }
            : {
                task: {
                  ...fixture.getTask("uncertain-task"),
                  goal: "A different job for the same Bot.",
                },
              },
      });
    });
    await page.goto(`/studio?agent=${bots[0].id}`);
    await workConversation(page).fill("Read the current public hours.");
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect(page.getByRole("button", { name: "Refresh work", exact: true })).toBeVisible();
    await expect(workConversation(page)).toHaveValue("Read the current public hours.");
    await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
    expect(starts).toBe(1);
    await page.getByRole("button", { name: "Refresh work", exact: true }).click();
    await expect(page.getByRole("button", { name: "Refresh work", exact: true })).toHaveCount(0);
    await expect(page.locator(".wl-work-current-step")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
    expect(starts).toBe(1);
  });
}

test("an authoritative held Refresh fences duplicate refreshes and old or new active polls", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = new Date().toISOString();
  const fixture = await mockWorkspace(page, [
    {
      id: "held-refresh-task",
      agentId: bots[0].id,
      goal: "Read the public directory.",
      status: "running",
      summary: null,
      question: null,
      sources: [],
      events: [],
      turnCount: 1,
      actionCount: 1,
      startedAt: now,
      finishedAt: null,
      updatedAt: now,
      liveView: false,
      stopping: false,
    },
  ]);
  await page.goto(`/studio?agent=${bots[0].id}`);
  const chat = page.getByRole("region", { name: "Front Desk work conversation", exact: true });
  await expect(chat.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  let releasePoll: () => void = () => undefined;
  const pollGate = new Promise<void>((resolve) => {
    releasePoll = resolve;
  });
  let pollReads = 0;
  await page.route("**/api/computer/tasks/held-refresh-task", async (route) => {
    pollReads += 1;
    if (pollReads > 1) return route.fallback();
    const snapshot = structuredClone(fixture.getTask("held-refresh-task"));
    await pollGate;
    await route.fulfill({ json: { task: snapshot } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => pollReads).toBe(1);
  await page.route("**/api/computer/tasks/held-refresh-task/stop", async (route) => {
    fixture.setTask("held-refresh-task", { stopping: true });
    await route.fulfill({ json: { success: true } });
  });
  await chat.getByRole("button", { name: "Stop", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Refresh work", exact: true });
  await expect(refresh).toBeVisible();
  let releaseRefresh: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshReads = 0;
  await page.route("**/api/computer/tasks", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    refreshReads += 1;
    const snapshot = structuredClone(fixture.getTask("held-refresh-task"));
    await refreshGate;
    await route.fulfill({ json: { tasks: [snapshot] } });
  });
  await refresh.click();
  await expect.poll(() => refreshReads).toBe(1);
  await refresh.click();
  releasePoll();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // Span the real two-second active-poll interval while the refresh is held.
  await page.waitForTimeout(2200);
  expect(pollReads).toBe(1);
  expect(refreshReads).toBe(1);
  releaseRefresh();
  await expect(refresh).toHaveCount(0);
  await expect(chat.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
});
