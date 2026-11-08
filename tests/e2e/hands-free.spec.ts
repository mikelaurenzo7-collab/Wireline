import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function mockSpeech(page: Page, supported = true) {
  await page.addInitScript(
    ({ supported }) => {
      const state = {
        starts: 0,
        aborts: 0,
        spoken: [] as string[],
        recognition: null as any,
        utterance: null as any,
      };
      class Recognition {
        onstart: any;
        onend: any;
        onerror: any;
        onresult: any;
        start() {
          state.starts++;
          state.recognition = this;
          queueMicrotask(() => this.onstart?.());
        }
        abort() {
          state.aborts++;
          if (state.recognition === this) state.recognition = null;
        }
      }
      class Utterance {
        onend: any;
        onerror: any;
        constructor(public text: string) {}
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: supported ? Recognition : undefined,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: Utterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          speak: (utterance: any) => {
            state.utterance = utterance;
            state.spoken.push(utterance.text);
          },
          cancel: () => {
            state.utterance = null;
          },
        },
      });
      Object.assign(window, { __handsFree: state });
    },
    { supported },
  );
}
async function say(page: Page, text: string) {
  await expect(page.getByText("Microphone on", { exact: true })).toBeVisible();
  await page.evaluate((text) => {
    const state = (window as any).__handsFree;
    if (!state.recognition?.onresult) throw new Error("Microphone is not listening.");
    state.recognition.onresult({ results: [{ isFinal: true, 0: { transcript: text } }] });
  }, text);
}
async function finishSpeech(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).__handsFree.utterance?.onend)))
    .toBe(true);
  await page.evaluate(() => (window as any).__handsFree.utterance.onend());
}
async function workspace(page: Page) {
  // This is UI/lifecycle proof: no real provider or non-loopback HTTP traffic.
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  const starts: Record<string, unknown>[] = [];
  const notes: Array<{ id: string; content: string }> = [];
  const chats: Record<string, unknown>[] = [];
  let tasks: Record<string, unknown>[] = [];
  let noteFails = false;
  let chatFails = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/computer/tasks" && request.method() === "POST") {
      const input = request.postDataJSON();
      starts.push(input);
      const now = new Date().toISOString();
      const task = {
        id: "hands-free-task",
        agentId: input.agentId,
        goal: input.goal,
        summary: null,
        question: null,
        status: "running",
        sources: [],
        events: [],
        turnCount: 0,
        actionCount: 0,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
        liveView: false,
        ownerControl: false,
        stopping: false,
      };
      tasks = [task];
      return route.fulfill({ status: 201, json: { task } });
    }
    if (path.endsWith("/workspace/memory")) {
      if (request.method() === "POST") {
        if (noteFails)
          return route.fulfill({ status: 503, json: { error: "Check Memory before retrying." } });
        notes.push({ id: "42", content: request.postDataJSON().content });
      }
      return route.fulfill({ json: { memories: notes } });
    }
    if (path.endsWith("/workspace/messages/stream")) {
      chats.push(request.postDataJSON());
      if (chatFails)
        return route.fulfill({ status: 503, json: { error: "Chat could not be reached." } });
      return route.fulfill({
        contentType: "text/event-stream",
        body: `event: done\ndata: ${JSON.stringify({ messageId: "101", reply: "I drafted your follow-up. Review it before sending.", changes: [], actions: [], toolToggles: [] })}\n\n`,
      });
    }
    if (path === "/api/computer/tasks/hands-free-task")
      return route.fulfill({ json: { task: tasks[0] } });
    const json =
      path === "/api/auth/session"
        ? { user: { id: "owner-test", email: "owner@example.test" } }
        : path === "/api/agents"
          ? {
              agents: [
                { id: "field-bot", name: "Field Bot", role: "personal_assistant" },
                { id: "other-bot", name: "Other Bot", role: "receptionist" },
              ],
            }
          : path === "/api/billing/status"
            ? {
                email_verified: true,
                channel_entitlements: {
                  plan_id: "omnichannel",
                  subscription_status: "active",
                  channels: ["voice", "email", "sms"],
                },
              }
            : path === "/api/computer/status"
              ? { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 60 } }
              : path === "/api/computer/tasks"
                ? { tasks }
                : path.startsWith("/api/agent-config/")
                  ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
                  : {
                      messages: [],
                      accounts: [],
                      numbers: [],
                      integrations: [],
                      data: [],
                      threads: [],
                    };
    return route.fulfill({ json });
  });
  return {
    starts,
    notes,
    chats,
    failNote: () => {
      noteFails = true;
    },
    failChat: () => {
      chatFails = true;
    },
    finishTask: () => {
      tasks = tasks.map((task) => ({
        ...task,
        status: "completed",
        summary: "Three public roofing services found.",
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    },
  };
}

for (const [width, height, theme] of [
  [320, 740, "light"],
  [375, 812, "light"],
  [1440, 1000, "dark"],
] as const) {
  test(`hands-free uses the real draft, deliberate send and private notes at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((theme) => localStorage.setItem("wireline-theme", theme), theme);
    await mockSpeech(page);
    const api = await workspace(page);
    await page.goto("/studio?agent=field-bot&chat=computer");
    const draft = page.getByRole("textbox", { name: "Task for Field Bot", exact: true });
    await expect(draft).toBeVisible();
    expect(await page.evaluate(() => (window as any).__handsFree.starts)).toBe(0);
    await page.getByRole("button", { name: "Hands-free", exact: true }).click();
    await page.getByRole("button", { name: "Check audio", exact: true }).click();
    expect(await page.evaluate(() => (window as any).__handsFree.starts)).toBe(0);
    await finishSpeech(page);
    await page.getByRole("button", { name: "Start listening", exact: true }).click();
    await say(page, "Find public roofing services near Oak Street");
    await expect(draft).toHaveValue("Find public roofing services near Oak Street");
    expect(api.starts).toHaveLength(0);
    await expect(page.getByText("Microphone paused", { exact: true })).toBeVisible();
    await finishSpeech(page);
    await say(page, "send task");
    await expect.poll(() => api.starts.length).toBe(1);
    expect(api.starts[0]).toMatchObject({
      agentId: "field-bot",
      goal: "Find public roofing services near Oak Street",
    });
    await expect(page.getByRole("button", { name: /End hands-free/ })).toBeVisible();
    await expect(draft).toHaveValue("");
    api.finishTask();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as any).__handsFree.spoken.some((text: string) =>
              text.includes("Three public roofing"),
            ),
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    await finishSpeech(page);
    await say(page, "Oak Street needs a follow-up roof inspection");
    await finishSpeech(page);
    await say(page, "save note");
    await expect.poll(() => api.notes.length).toBe(1);
    expect(api.notes[0]!.content).toBe("Oak Street needs a follow-up roof inspection");
    await expect(draft).toHaveValue("");
    expect(api.starts).toHaveLength(1);
    await finishSpeech(page);
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
    const proofDir = process.env.HANDS_FREE_PROOF_DIR;
    if (proofDir) await mkdir(proofDir, { recursive: true });
    await info.attach(`hands-free-${width}-${theme}`, {
      body: await page.screenshot({
        ...(proofDir ? { path: join(proofDir, `hands-free-${width}-${theme}.png`) } : {}),
      }),
      contentType: "image/png",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const control of [
      draft,
      page.getByRole("button", { name: "End hands-free", exact: true }),
    ]) {
      // The expanded controls must not cover the composer or sit behind mobile navigation.
      expect(
        await control.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.top >= 0 && rect.bottom <= innerHeight && Boolean(hit && node.contains(hit));
        }),
      ).toBe(true);
    }
    expect(
      await page.getByRole("button", { name: "Start work", exact: true }).evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2);
        // Disabled buttons ignore pointer events; their form must still be exposed.
        return Boolean(hit && node.closest("form")?.contains(hit));
      }),
    ).toBe(true);
    await say(page, "Keep this new task draft for review");
    await finishSpeech(page);
    const send = page.getByRole("button", { name: "Start work", exact: true });
    await expect(send).toBeEnabled();
    expect(
      await send.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          [2, rect.height / 2, rect.height - 2].every((offset) => {
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + offset);
            return Boolean(hit && node.contains(hit));
          })
        );
      }),
    ).toBe(true);
    if (proofDir)
      await page.screenshot({ path: join(proofDir, `hands-free-draft-${width}-${theme}.png`) });
    expect(api.starts).toHaveLength(1);
    await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event("devicechange")));
    await expect(page.getByText(/Audio devices changed/)).toBeVisible();
    const before = await page.evaluate(() => (window as any).__handsFree.starts);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => (window as any).__handsFree.starts)).toBe(before);
  });
}

test("message mode speaks the real reply and keeps external approvals in Studio", async ({
  page,
}) => {
  await mockSpeech(page);
  const api = await workspace(page);
  await page.goto("/studio?agent=field-bot&chat=setup");
  const draft = page.getByRole("textbox", { name: "Message Field Bot", exact: true });
  await page.getByRole("button", { name: "Hands-free", exact: true }).click();
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await say(page, "Draft a follow-up for my contractor");
  await finishSpeech(page);
  await say(page, "send message");
  await expect.poll(() => api.chats.length).toBe(1);
  expect(api.chats[0]!.content).toBe("Draft a follow-up for my contractor");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__handsFree.spoken.some((text: string) =>
          text.includes("Review it before sending"),
        ),
      ),
    )
    .toBe(true);
  expect(api.starts).toHaveLength(0);
  await expect(draft).toHaveValue("");
});
test("failed note save keeps the draft and never retries automatically", async ({ page }) => {
  await mockSpeech(page);
  const api = await workspace(page);
  api.failNote();
  await page.goto("/studio?agent=field-bot&chat=computer");
  await page
    .getByRole("textbox", { name: "Task for Field Bot", exact: true })
    .fill("Inspect Oak Street.");
  await page.getByRole("button", { name: "Hands-free", exact: true }).click();
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await say(page, "save note");
  await expect(page.getByText("Check Memory before retrying.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task for Field Bot", exact: true })).toHaveValue(
    "Inspect Oak Street.",
  );
  expect(api.notes).toHaveLength(0);
  expect(api.starts).toHaveLength(0);
});
test("failed owner chat preserves the spoken draft without an automatic retry", async ({
  page,
}) => {
  await mockSpeech(page);
  const api = await workspace(page);
  api.failChat();
  await page.goto("/studio?agent=field-bot&chat=setup");
  const draft = page.getByRole("textbox", { name: "Message Field Bot", exact: true });
  await page.getByRole("button", { name: "Hands-free", exact: true }).click();
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await say(page, "Draft a follow-up for Oak Street");
  await finishSpeech(page);
  await say(page, "send message");
  await expect(draft).toHaveValue("Draft a follow-up for Oak Street");
  await expect(page.getByRole("button", { name: "Start listening", exact: true })).toBeVisible();
  expect(api.chats).toHaveLength(1);
  expect(api.starts).toHaveLength(0);
});
test("task handoff fills an inert draft, removes its fragment and preserves existing edits", async ({
  page,
}) => {
  await mockSpeech(page);
  const api = await workspace(page);
  const goal = "Find roofing contractors & compare public pricing";
  await page.goto(`/studio?agent=field-bot&chat=computer#${new URLSearchParams({ task: goal })}`);
  const draft = page.getByRole("textbox", { name: "Task for Field Bot", exact: true });
  await expect(draft).toHaveValue(goal);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  expect(api.starts).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__handsFree.starts)).toBe(0);
  await draft.fill("Keep my current edits.");
  await page.evaluate(() => {
    window.location.hash = new URLSearchParams({ task: "A second task from glasses" }).toString();
  });
  await expect(page.getByText("Task from a connected assistant", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Keep my current edits.");
  await page.getByRole("button", { name: "Use task draft", exact: true }).click();
  await expect(draft).toHaveValue("A second task from glasses");
  expect(api.starts).toHaveLength(0);
});
test("unsupported speech leaves typing usable without microphone requests", async ({ page }) => {
  await mockSpeech(page, false);
  const api = await workspace(page);
  await page.goto("/studio?agent=field-bot&chat=computer");
  await page.getByRole("button", { name: "Hands-free", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start listening", exact: true })).toBeDisabled();
  await expect(page.getByText(/does not support hands-free speech/)).toBeVisible();
  const draft = page.getByRole("textbox", { name: "Task for Field Bot", exact: true });
  await draft.fill("Find public opening hours.");
  await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeEnabled();
  expect(api.starts).toHaveLength(0);
});

test("a task handoff waits for work history and cannot become a running task's reply", async ({
  page,
}) => {
  await mockSpeech(page);
  const api = await workspace(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const now = new Date().toISOString();
  await page.route("**/api/computer/tasks", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await gate;
    return route.fulfill({
      json: {
        tasks: [
          {
            id: "existing-work",
            agentId: "field-bot",
            goal: "Existing task",
            status: "needs_input",
            question: "Which city should I search?",
            summary: null,
            events: [],
            sources: [],
            actionCount: 0,
            turnCount: 0,
            startedAt: now,
            updatedAt: now,
            finishedAt: null,
            liveView: false,
            ownerControl: false,
            stopping: false,
          },
        ],
      },
    });
  });
  const goal = "Find contractors for a separate new task";
  await page.goto(`/studio?agent=field-bot&chat=computer#${new URLSearchParams({ task: goal })}`);
  const draft = page.getByRole("textbox", { name: "Task for Field Bot", exact: true });
  await expect(draft).toHaveValue("");
  release();
  await expect(page.getByText("Task from a connected assistant", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply to Field Bot", exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByRole("button", { name: "Use task draft", exact: true })).toBeDisabled();
  expect(api.starts).toHaveLength(0);
});
test("hidden pages and Bot changes require another explicit listening start", async ({ page }) => {
  await mockSpeech(page);
  await workspace(page);
  await page.goto("/studio?agent=field-bot&chat=computer");
  await page.getByRole("button", { name: "Hands-free", exact: true }).click();
  await page.getByRole("button", { name: "Start listening", exact: true }).click();
  await expect(page.getByText("Microphone on", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText(/this page is hidden/)).toBeVisible();
  await page.goto("/studio?agent=other-bot&chat=computer");
  await expect(page.getByRole("textbox", { name: "Task for Other Bot", exact: true })).toHaveValue(
    "",
  );
  expect(await page.evaluate(() => (window as any).__handsFree.starts)).toBe(0);
});
