import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DesktopBridge, DesktopState, TaskView } from "../../apps/desktop/src/contracts";

type Call = { operation: string; input?: unknown };
declare global {
  interface Window {
    botbound: DesktopBridge;
    desktopFixture: {
      calls: Call[];
      state: DesktopState;
      emit(next: DesktopState): void;
      failStart: boolean;
      failReply: boolean;
      failComplete: boolean;
      failServer: boolean;
      holdStart: boolean;
      releaseStart?: () => void;
      releaseApproval?: () => void;
    };
  }
}

const initial: DesktopState = {
  connected: true,
  connecting: false,
  bots: [{ id: "bot-1", name: "Front Desk" }],
  windows: [{ id: "window-1", title: "Prospects", appName: "Browser" }],
  servers: [],
  task: null,
  error: null,
  platform: "win32",
};
const task: TaskView = {
  id: "task-1",
  bot: initial.bots[0],
  goal: "Review prospects",
  window: initial.windows[0],
  status: "approval",
  step: 1,
  expiresAt: Date.now() + 60_000,
  canResume: true,
  message: "Review the next action.",
  proposal: {
    id: "proposal-1",
    decision: "action",
    summary: "<img src=x onerror=alert(1)>",
    action: { type: "type_text", text: "Exact draft <script>alert(1)</script>" },
  },
  receipts: [],
};

async function openDesktop(page: Page, state: DesktopState = initial) {
  await page.addInitScript((current) => {
    let listener: (state: DesktopState) => void = () => undefined;
    const fixture = {
      calls: [] as Call[],
      state: current,
      failStart: false,
      failReply: false,
      failComplete: false,
      failServer: false,
      holdStart: false,
      releaseStart: undefined as (() => void) | undefined,
      releaseApproval: undefined as (() => void) | undefined,
      emit(next: DesktopState) {
        fixture.state = next;
        listener(next);
      },
    };
    window.desktopFixture = fixture;
    const record = async (operation: string, input?: unknown) => {
      fixture.calls.push({ operation, input });
    };
    window.botbound = {
      getState: async () => fixture.state,
      onState: (callback) => {
        listener = callback;
        return () => {
          listener = () => undefined;
        };
      },
      connect: () => record("connect"),
      disconnect: () => record("disconnect"),
      confirmRevocation: (confirmed) => record("confirmRevocation", confirmed),
      refreshWindows: () => record("windows"),
      openAccount: () => record("account"),
      startTask: async (input) => {
        await record("start", input);
        if (fixture.holdStart)
          await new Promise<void>((resolve) => {
            fixture.releaseStart = resolve;
          });
        if (fixture.failStart)
          throw new Error("The selected window is unavailable. Choose it again.");
      },
      approve: async (id) => {
        await record("approve", id);
        await new Promise<void>((resolve) => {
          fixture.releaseApproval = resolve;
        });
      },
      stop: async () => {
        await record("stop");
        if (fixture.state.task)
          fixture.emit({
            ...fixture.state,
            task: { ...fixture.state.task, status: "stopped", proposal: null },
          });
      },
      reply: async (text) => {
        await record("reply", text);
        if (fixture.failReply) throw new Error("Could not continue. Your input is preserved.");
      },
      complete: async () => {
        await record("complete");
        if (fixture.failComplete) throw new Error("Could not save your review. Try again.");
        if (fixture.state.task?.receipts.some((receipt) => receipt.status === "unknown"))
          fixture.emit({
            ...fixture.state,
            task: { ...fixture.state.task, status: "stopped", unknownOutcomeReviewed: true },
          });
      },
      addServer: async (input) => {
        await record("addServer", input);
        if (fixture.failServer) throw new Error("Could not load this tool catalog.");
      },
      refreshServer: (id) => record("refreshServer", id),
      approveCatalog: (input) => record("approveCatalog", input),
      removeServer: (id) => record("removeServer", id),
    };
  }, state);
  await page.route("**/__desktop-ui__/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/__desktop-ui__/")[1];
    const files: Record<string, [string, string]> = {
      "index.html": ["apps/desktop/src/renderer/index.html", "text/html"],
      "app.js": ["apps/desktop/src/renderer/app.js", "text/javascript"],
      "styles.css": ["apps/desktop/src/renderer/styles.css", "text/css"],
      "tokens.css": ["src/styles/tokens.generated.css", "text/css"],
      "fonts.css": ["public/fonts.css", "text/css"],
      "botbound.png": ["public/brand/botbound-app-icon.png", "image/png"],
    };
    const file = files[name];
    if (!file) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    await route.fulfill({ contentType: file[1], body: await readFile(resolve(file[0])) });
  });
  await page.goto("/__desktop-ui__/index.html");
  await expect(
    page.getByRole("button", { name: "Disconnect everywhere", exact: true }),
  ).toBeEnabled();
}

test("desktop task consent and failed start preserve the owner's draft", async ({
  page,
}, testInfo) => {
  await openDesktop(page);
  await page.getByLabel("Shared window", { exact: true }).selectOption("window-1");
  const botControl = await page.getByLabel("Your Bot", { exact: true }).boundingBox();
  const windowControl = await page.getByLabel("Shared window", { exact: true }).boundingBox();
  expect(botControl).not.toBeNull();
  expect(windowControl).not.toBeNull();
  expect(Math.abs(botControl!.y - windowControl!.y)).toBeLessThanOrEqual(1);
  await page
    .getByRole("textbox", { name: "Task", exact: true })
    .fill("Review prospects without contacting anyone.");
  await page.screenshot({
    path: testInfo.outputPath("desktop-owner-task-normal.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  expect(await page.evaluate(() => window.desktopFixture.calls)).toEqual([]);
  await page.getByRole("checkbox", { name: /Share this task/ }).check();
  await page.evaluate(() => {
    window.desktopFixture.failStart = true;
  });
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("selected window is unavailable");
  await expect(page.getByRole("textbox", { name: "Task", exact: true })).toHaveValue(
    "Review prospects without contacting anyone.",
  );
  await expect(page.getByRole("checkbox", { name: /Share this task/ })).toBeChecked();
  await page.evaluate(() => {
    window.desktopFixture.failStart = false;
  });
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.getByRole("checkbox", { name: /Share this task/ })).not.toBeChecked();
  expect(
    await page.evaluate(
      () => window.desktopFixture.calls.filter((call) => call.operation === "start").at(-1)?.input,
    ),
  ).toEqual({
    botId: "bot-1",
    goal: "Review prospects without contacting anyone.",
    windowId: "window-1",
    serverIds: [],
    shareConfirmed: true,
  });
});

test("desktop step labels follow the engine counter through first and final proposals", async ({
  page,
}) => {
  await openDesktop(page, {
    ...initial,
    task: { ...task, step: 0, status: "planning", proposal: null },
  });
  await expect(page.locator("#task-target")).toHaveText("Front Desk · Browser: Prospects · Step 1");
  await page.evaluate((firstProposal) => {
    window.desktopFixture.emit({ ...window.desktopFixture.state, task: firstProposal });
  }, task);
  await expect(page.locator("#task-target")).toHaveText("Front Desk · Browser: Prospects · Step 1");
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.emit({
      ...current,
      task: { ...current.task!, step: 19, status: "planning", proposal: null },
    });
  });
  await expect(page.locator("#task-target")).toHaveText(
    "Front Desk · Browser: Prospects · Step 20",
  );
  for (const status of [
    "approval",
    "executing",
    "review_result",
    "completed",
    "stopped",
  ] as const) {
    await page.evaluate(
      ({ finalProposal, nextStatus }) => {
        window.desktopFixture.emit({
          ...window.desktopFixture.state,
          task: {
            ...finalProposal,
            step: 20,
            status: nextStatus,
            proposal:
              nextStatus === "approval"
                ? finalProposal.proposal
                : nextStatus === "review_result"
                  ? { id: "result-20", decision: "complete", summary: "Review the result." }
                  : null,
          },
        });
      },
      { finalProposal: task, nextStatus: status },
    );
    await expect(page.locator("#task-target")).toHaveText(
      "Front Desk · Browser: Prospects · Step 20",
    );
  }
});

test("desktop approval renders exact untrusted text and leaves Stop usable during a pending action", async ({
  page,
}) => {
  await openDesktop(page, { ...initial, task });
  await expect(page.locator("#proposal-summary")).toHaveText(task.proposal!.summary);
  await expect(
    page.getByRole("region", { name: "Review next action" }).locator("img, script"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Exact proposed action")).toContainText(
    "Exact draft <script>alert(1)</script>",
  );
  await page.getByRole("button", { name: "Approve once", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve once", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("#task-status")).toHaveText("Stopped");
  await page.evaluate(() => window.desktopFixture.releaseApproval?.());
  await expect(page.locator("#proposal")).toBeHidden();
  expect(
    await page.evaluate(() => window.desktopFixture.calls.map((call) => call.operation)),
  ).toEqual(["approve", "stop"]);
});

test("desktop action review remains readable at minimum width with enlarged text", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await openDesktop(page, { ...initial, task });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
  await expect(page.getByLabel("Exact proposed action")).toContainText("Exact draft");
  expect(
    await page.evaluate(() => {
      const elements = [
        document.documentElement,
        ...document.querySelectorAll("main, section, pre"),
      ];
      return elements.every((element) => element.scrollWidth <= element.clientWidth + 1);
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Approve once", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Approve once", exact: true })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("desktop-review-enlarged.png"),
    fullPage: false,
  });
});

test("desktop Stop is available before an asynchronous start produces task state", async ({
  page,
}) => {
  await openDesktop(page);
  await page.getByLabel("Shared window", { exact: true }).selectOption("window-1");
  await page
    .getByRole("textbox", { name: "Task", exact: true })
    .fill("Review the current document.");
  await page.getByRole("checkbox", { name: /Share this task/ }).check();
  await page.evaluate(() => {
    window.desktopFixture.holdStart = true;
  });
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(
    await page.evaluate(() => window.desktopFixture.calls.map((call) => call.operation)),
  ).toEqual(["start", "stop"]);
  await page.evaluate(() => window.desktopFixture.releaseStart?.());
});

test("desktop disconnect clears sharing consent and private drafts before another account connects", async ({
  page,
}) => {
  await openDesktop(page);
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Private task details");
  await page.getByRole("checkbox", { name: /Share this task/ }).check();
  await page.locator("#mcp-settings > summary").click();
  await page.getByLabel("Access token", { exact: false }).fill("private-draft-token");
  await page.evaluate(() =>
    window.desktopFixture.emit({
      ...window.desktopFixture.state,
      connected: false,
      bots: [],
      servers: [],
      task: null,
    }),
  );
  await expect(page.getByRole("textbox", { name: "Task", exact: true })).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /Share this task/ })).not.toBeChecked();
  await expect(page.getByLabel("Access token", { exact: false })).toHaveValue("");
});

test("desktop failed replies retain input and completion requires explicit result review", async ({
  page,
}) => {
  await openDesktop(page, { ...initial, task: { ...task, status: "needs_input", proposal: null } });
  await page
    .getByRole("textbox", { name: "Your input", exact: true })
    .fill("Use the current document only.");
  await page.evaluate(() => {
    window.desktopFixture.failReply = true;
  });
  await page.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your input is preserved");
  await expect(page.getByRole("textbox", { name: "Your input", exact: true })).toHaveValue(
    "Use the current document only.",
  );
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.emit({ ...current, task: { ...current.task!, status: "review_result" } });
  });
  await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I reviewed the result.", exact: true }).check();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  expect(await page.evaluate(() => window.desktopFixture.calls.at(-1)?.operation)).toBe("complete");
});

test("desktop exposes Disconnect for an approved connection that could not be saved", async ({
  page,
}) => {
  await openDesktop(page, {
    ...initial,
    connected: false,
    bots: [],
    connectionRecoveryRequired: true,
  });
  await expect(page.locator("#connection-status")).toHaveText("Connection needs recovery");
  await expect(page.locator("#start")).toBeDisabled();
  await page.getByRole("button", { name: "Disconnect everywhere", exact: true }).click();
  expect(await page.evaluate(() => window.desktopFixture.calls.at(-1)?.operation)).toBe(
    "disconnect",
  );
});

test("desktop does not offer Resume for a restored failed task without a live grant", async ({
  page,
}) => {
  await openDesktop(page, {
    ...initial,
    task: { ...task, status: "failed", proposal: null, canResume: false },
  });
  await expect(page.getByRole("button", { name: "Resume task", exact: true })).toBeHidden();
  await expect(page.locator("#setup")).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.desktopFixture.calls.some((call) => call.operation === "reply"),
    ),
  ).toBe(false);
});

for (const status of ["review_result", "failed"] as const) {
  test(`desktop allows owner revision from ${status} without claiming completion`, async ({
    page,
  }) => {
    await openDesktop(page, { ...initial, task: { ...task, status, proposal: null } });
    if (status === "review_result")
      await page.getByRole("checkbox", { name: "I reviewed the result.", exact: true }).check();
    await page
      .getByRole("textbox", { name: "Your input", exact: true })
      .fill("Check the final paragraph again.");
    await page.evaluate(() => {
      window.desktopFixture.failReply = true;
    });
    await page.getByRole("button", { name: "Resume task", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your input", exact: true })).toHaveValue(
      "Check the final paragraph again.",
    );
    await page.evaluate(() => {
      window.desktopFixture.failReply = false;
    });
    await page.getByRole("button", { name: "Resume task", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your input", exact: true })).toHaveValue("");
    expect(await page.evaluate(() => window.desktopFixture.calls.at(-1))).toEqual({
      operation: "reply",
      input: "Check the final paragraph again.",
    });
    expect(
      await page.evaluate(() =>
        window.desktopFixture.calls.some((call) => call.operation === "complete"),
      ),
    ).toBe(false);
    if (status === "review_result") {
      await expect(
        page.getByRole("checkbox", { name: "I reviewed the result.", exact: true }),
      ).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toBeDisabled();
    }
  });
}

test("desktop requires a fresh destination acknowledgment before replacing an unknown outcome", async ({
  page,
}) => {
  await openDesktop(page, {
    ...initial,
    task: { ...task, status: "review_result", proposal: null },
  });
  await page.getByRole("checkbox", { name: "I reviewed the result.", exact: true }).check();
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.failComplete = true;
    window.desktopFixture.emit({
      ...current,
      task: {
        ...current.task!,
        status: "unknown",
        proposal: null,
        message: "The action may have happened. Check the target.",
        receipts: [
          {
            id: "uncertain-1",
            action: { type: "type_text", text: "Prospect draft" },
            summary: "Enter the requested title",
            status: "unknown",
            result: "Connection closed after dispatch.",
            createdAt: Date.now(),
          },
        ],
      },
    });
  });
  const acknowledgment = page.getByRole("button", { name: "Acknowledge outcome", exact: true });
  const checkedDestination = page.getByRole("checkbox", {
    name: "I checked the destination and understand the outcome is unconfirmed.",
    exact: true,
  });
  await expect(checkedDestination).not.toBeChecked();
  await expect(acknowledgment).toBeDisabled();
  await expect(page.locator("#setup")).toBeHidden();
  await expect(page.locator("#start")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resume task", exact: true })).toBeHidden();
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.emit({ ...current, task: { ...current.task!, status: "failed" } });
  });
  await expect(page.getByRole("button", { name: "Resume task", exact: true })).toBeHidden();
  await expect(acknowledgment).toBeDisabled();
  await page.locator("#history > summary").click();
  await expect(page.locator("#receipts")).toContainText("Enter the requested title · unknown");
  await checkedDestination.check();
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.emit({ ...current, connecting: true });
  });
  await expect(acknowledgment).toBeDisabled();
  await page.evaluate(() => {
    const current = window.desktopFixture.state;
    window.desktopFixture.emit({ ...current, connecting: false });
  });
  await acknowledgment.click();
  await expect(page.getByRole("alert")).toContainText("Could not save your review");
  await expect(acknowledgment).toBeEnabled();
  await expect(page.locator("#setup")).toBeHidden();
  await expect(page.locator("#receipts")).toContainText("Connection closed after dispatch.");
  await page.evaluate(() => {
    window.desktopFixture.failComplete = false;
  });
  await acknowledgment.click();
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#start")).toBeEnabled();
  await expect(page.locator("#receipts")).toContainText("Enter the requested title · unknown");
  expect(
    await page.evaluate(() => window.desktopFixture.calls.map((call) => call.operation)),
  ).toEqual(["complete", "complete"]);
});

test("desktop MCP catalog is explicit and failed connection setup preserves its fields", async ({
  page,
}) => {
  await openDesktop(page, {
    ...initial,
    servers: [
      {
        id: "server-1",
        label: "Documents",
        url: "https://example.com/mcp",
        hasCredential: true,
        catalogDigest: "new-digest",
        approvedDigest: null,
        selectedTools: [],
        tools: [
          {
            name: "edit_document",
            description: "Edits the selected document.",
            inputSchema: { type: "object", properties: { documentId: { type: "string" } } },
          },
        ],
      },
    ],
  });
  await page.locator("#mcp-settings > summary").click();
  await expect(
    page.getByRole("checkbox", { name: "edit_document", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "edit_document", exact: true }).check();
  await page.getByRole("button", { name: "Approve catalog", exact: true }).click();
  expect(await page.evaluate(() => window.desktopFixture.calls.at(-1))).toEqual({
    operation: "approveCatalog",
    input: { id: "server-1", digest: "new-digest", names: ["edit_document"] },
  });
  await page.getByLabel("Name", { exact: true }).fill("Private workspace");
  await page.getByLabel("HTTPS endpoint", { exact: true }).fill("https://example.com/mcp");
  await page.getByLabel("Access token", { exact: false }).fill("fixture-token");
  await page.evaluate(() => {
    window.desktopFixture.failServer = true;
  });
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load this tool catalog");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Private workspace");
  await expect(page.getByLabel("Access token", { exact: false })).toHaveValue("fixture-token");
});

test("desktop lost response recovery requires explicit account review", async ({ page }) => {
  await openDesktop(page, {
    ...initial,
    connected: false,
    connectionRecoveryRequired: true,
    connectionManualRecoveryRequired: true,
  });
  await expect(page.getByRole("heading", { name: "Connection unconfirmed" })).toBeVisible();
  const reset = page.getByRole("button", { name: "Reset local connection" });
  await expect(reset).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start task", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open account Apps", exact: true }).click();
  await page.getByRole("checkbox", { name: /I revoked BotBound Desktop/ }).check();
  await reset.click();
  expect(await page.evaluate(() => window.desktopFixture.calls)).toEqual([
    { operation: "account", input: undefined },
    { operation: "confirmRevocation", input: true },
  ]);
  await expect(
    page.getByRole("checkbox", { name: /I revoked BotBound Desktop/ }),
  ).not.toBeChecked();
});
