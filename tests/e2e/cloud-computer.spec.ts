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

async function mockComputer(
  page: Page,
  options: { status: Record<string, unknown>; tasks: MockTask[]; frame?: Buffer | null },
) {
  const replies: string[] = [];
  let tasks = options.tasks;
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
    if (path === "/api/computer/status") return route.fulfill({ json: options.status });
    if (path === "/api/computer/tasks" && request.method() === "GET") {
      return route.fulfill({ json: { tasks } });
    }
    const frameMatch = /^\/api\/computer\/tasks\/([^/]+)\/frame$/.exec(path);
    if (frameMatch) {
      return options.frame
        ? route.fulfill({ status: 200, contentType: "image/jpeg", body: options.frame })
        : route.fulfill({ status: 204, body: "" });
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
  return { replies };
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
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `computer-needs-input-${width}`);

    await detail.getByRole("textbox", { name: "Reply to your Bot" }).fill("Yes, skip the sign in.");
    await detail.getByRole("button", { name: "Reply" }).click();
    await expect(detail.getByText("Working", { exact: true })).toBeVisible();
    expect(replies).toEqual(["Yes, skip the sign in."]);

    const history = page.getByRole("complementary", { name: "Recent tasks" });
    await history.getByRole("button", { name: /Google Business page/ }).click();
    await expect(page.getByText("Your hours match on both pages.")).toBeVisible();
  });
}

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
