import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Cadences from "../src/components/Cadences";
import ApprovalInbox from "../src/components/ApprovalInbox";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useId: () => "builder",
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/contexts/ToastContext", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../src/hooks/useApiError", () => ({
  useApiError: () => ({ handleApiError: vi.fn(), handleCatchError: vi.fn() }),
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEventOnce: vi.fn() }));
vi.mock("../src/components/ui/EmptyState", () => ({ EmptyState: "empty-state" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/layout/ClientRouteLoading", () => ({ default: "loading" }));
vi.mock("../src/components/layout/WorkspaceTabStrip", () => ({ WorkspaceTabStrip: "tabs" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = {
  children?: ReactNode;
  title?: string;
  tabs?: Array<{ id: string; label: string; shortLabel: string }>;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  value?: string;
  "aria-label"?: string;
  onValueChange?: (value: string) => void;
  task?: { id: string };
  onResolved?: () => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}
function render(component: () => ReactNode = Cadences) {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effects = [];
  return component();
}
async function flush() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}
function json(value: unknown) {
  return new Response(JSON.stringify(value));
}
const sequence = (name = "Follow Up") => ({
  id: "sequence",
  name,
  description: null,
  active: false,
  steps: [{ type: "sms", delayHours: 0 }],
  createdAt: "2026-09-20T12:00:00Z",
});
const triage = {
  hot_leads: [{ id: "lead" }],
  compliance: [],
  pending_tasks: [],
  escalations: [],
  knowledge_gaps: [],
  counts: { hot_leads: 1, escalations: 0, knowledge_gaps: 0 },
};
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.fetch.mockReset();
});

describe("sequence load integrity", () => {
  it.each(["network", "json", "shape"])(
    "keeps sequences available when run status fails: %s",
    async (failure) => {
      h.fetch.mockImplementation((url: string) => {
        if (url === "/api/cadences") return Promise.resolve(json({ cadences: [sequence()] }));
        if (failure === "network") return Promise.reject(new Error("offline"));
        return Promise.resolve(failure === "json" ? new Response("not json") : json({ runs: {} }));
      });
      render();
      h.effects[0]();
      await flush();
      const tree = render();
      expect(textOf(tree)).toContain("Follow Up");
      expect(textOf(tree)).toContain("Run status unavailable");
      expect(
        elements(tree).find((node) => textOf(node.props.children) === "Retry")?.props.onClick,
      ).toBeTypeOf("function");
    },
  );

  it.each([{}, { cadences: {} }, { cadences: [{ ...sequence(), steps: null }] }])(
    "shows a recoverable error for malformed sequences: %j",
    async (body) => {
      h.fetch.mockImplementation((url: string) =>
        Promise.resolve(json(url === "/api/cadences" ? body : { runs: [] })),
      );
      render();
      h.effects[0]();
      await flush();
      expect(
        elements(render()).some((node) => node.props.title === "Couldn't Load Sequences"),
      ).toBe(true);
    },
  );

  it("recovers missing run status without losing the sequence", async () => {
    let unavailable = true;
    h.fetch.mockImplementation((url: string) => {
      if (url === "/api/cadences") return Promise.resolve(json({ cadences: [sequence()] }));
      return Promise.resolve(
        unavailable
          ? new Response("", { status: 503 })
          : json({
              runs: [
                {
                  id: "run",
                  cadenceId: "sequence",
                  leadId: "1",
                  currentStep: 0,
                  status: "active",
                  nextDueAt: null,
                  lastResult: null,
                },
              ],
            }),
      );
    });
    render();
    h.effects[0]();
    await flush();
    const retry = elements(render()).find(
      (node) => node.type === "button" && textOf(node.props.children) === "Retry",
    );
    expect(retry).toBeDefined();
    unavailable = false;
    retry!.props.onClick!();
    await flush();
    expect(textOf(render())).not.toContain("Run status unavailable");
    expect(textOf(render())).toMatch(/1\s+Enrolled/);
    expect(textOf(render())).not.toContain("active run");
  });

  it("ignores a superseded load even when its transport ignores abort", async () => {
    let release!: () => void;
    const oldLoad = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    h.fetch.mockImplementation((url: string) => {
      calls++;
      if (calls <= 2)
        return oldLoad.then(() =>
          json(url === "/api/cadences" ? { cadences: [sequence("Old Sequence")] } : { runs: [] }),
        );
      return Promise.resolve(
        json(url === "/api/cadences" ? { cadences: [sequence("Current Sequence")] } : { runs: [] }),
      );
    });
    render();
    const start = h.effects[0];
    start();
    start();
    await flush();
    release();
    await flush();
    expect(textOf(render())).toContain("Current Sequence");
    expect(textOf(render())).not.toContain("Old Sequence");
  });
});

describe("sequence draft continuity", () => {
  it("preserves the submitted draft through a failed save and allows a successful retry", async () => {
    let finishSave!: (response: Response) => void;
    const pendingSave = new Promise<Response>((resolve) => {
      finishSave = resolve;
    });
    let attempts = 0;
    h.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        attempts++;
        return attempts === 1 ? pendingSave : Promise.resolve(json({ cadence: sequence() }));
      }
      return Promise.resolve(
        json(url === "/api/cadences" ? { cadences: [sequence()] } : { runs: [] }),
      );
    });
    const button = (label: string) =>
      elements(render()).find(
        (node) => node.type === "button" && textOf(node.props.children).trim() === label,
      )!;
    render();
    h.effects[0]();
    await flush();
    button("Create sequence").props.onClick!();
    elements(render()).find((node) => node.props.id === "builder-name")!.props.onChange!({
      target: { value: "Consultation Follow-Up" },
    });
    elements(render()).find((node) => node.props.onValueChange)!.props.onValueChange!("email");
    const message = "Hi {{name}},\n\nThanks for your time.\nWhen would you like to meet?";
    const messageField = () =>
      elements(render()).find((node) => node.props["aria-label"] === "Step 1 Email Message")!;
    messageField().props.onChange!({ target: { value: message } });

    button("Save Sequence").props.onClick!();
    expect(messageField().props.disabled).toBe(true);
    expect(button("Cancel").props.disabled).toBe(true);
    // Close and repeated save actions cannot discard or duplicate the draft
    // while its first request is unresolved.
    button("Cancel").props.onClick!();
    elements(render()).find((node) => node.props["aria-label"] === "Close cadence builder")!.props
      .onClick!();
    button("Saving…").props.onClick!();
    expect(attempts).toBe(1);
    expect(messageField().props.value).toBe(message);

    finishSave(new Response(JSON.stringify({ error: "Try again" }), { status: 503 }));
    await flush();
    expect(messageField().props.disabled).toBe(false);
    expect(messageField().props.value).toBe(message);
    expect(elements(render()).find((node) => node.props.id === "builder-name")!.props.value).toBe(
      "Consultation Follow-Up",
    );
    button("Save Sequence").props.onClick!();
    await flush();
    const posts = h.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    for (const [, init] of posts) {
      expect(JSON.parse(init.body).steps).toEqual([
        { type: "email", delayHours: 0, template: message },
      ]);
    }
    expect(elements(render()).some((node) => node.props.id === "builder-name")).toBe(false);
  });
});

describe("approval count availability", () => {
  it("retains unresolved cards when both queues fail after resolving a sibling", async () => {
    const tasks = ["draft", "resolved"].map((id) => ({ id, status: "pending" }));
    h.fetch.mockImplementation((url: string) =>
      Promise.resolve(json(url === "/api/triage" ? triage : { tasks })),
    );
    render(() => ApprovalInbox({}));
    h.effects[0]();
    await flush();
    const cards = () => elements(render(() => ApprovalInbox({}))).filter((node) => node.props.task);
    const draft = cards().find((node) => node.props.task?.id === "draft")!;
    let finish!: (response: Response) => void;
    // Both requests share a deferred failure so the pending state is observable.
    const failed = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    h.fetch.mockImplementation(() => failed);
    cards().find((node) => node.props.task?.id === "resolved")!.props.onResolved!();
    expect(cards().map((node) => node.props.task?.id)).toEqual(["draft"]);
    expect(cards()[0].key).toBe(draft.key);
    expect(cards()[0].type).toBe(draft.type);
    finish(new Response("", { status: 503 }));
    await flush();
    expect(cards().map((node) => node.props.task?.id)).toEqual(["draft"]);
    expect(textOf(render(() => ApprovalInbox({})))).toContain("Last loaded items are shown");
    expect(
      elements(render(() => ApprovalInbox({}))).some(
        (node) => node.props.title === "Approval Queue Clear",
      ),
    ).toBe(false);
  });

  it.each(["tasks", "triage"])(
    "omits only counts from the unavailable %s source",
    async (failed) => {
      h.fetch.mockImplementation((url: string) => {
        const isTriage = url === "/api/triage";
        return Promise.resolve(
          (isTriage ? failed === "triage" : failed === "tasks")
            ? new Response("", { status: 503 })
            : json(isTriage ? triage : { tasks: [] }),
        );
      });
      render(() => ApprovalInbox({}));
      h.effects[0]();
      await flush();
      const nodes = elements(render(() => ApprovalInbox({})));
      expect(nodes.filter((node) => node.type === "notice")).toHaveLength(1);
      const tabs = nodes.find((node) => node.type === "tabs")!.props.tabs!;
      const pending = tabs.find((tab) => tab.id === "pending")!;
      const hot = tabs.find((tab) => tab.id === "hot_leads")!;
      expect(pending.label).toBe(failed === "tasks" ? "Pending Actions" : "Pending Actions (0)");
      expect(hot.label).toBe(failed === "triage" ? "Hot Leads" : "Hot Leads (1)");
      expect(pending.shortLabel).toBe(failed === "tasks" ? "Pending" : "Pending (0)");
    },
  );
});

describe("approval message edits", () => {
  it.each([
    ["send_email", "Write a message…"],
    ["send_text_message", "Write a message…"],
    ["send_email", "Subject"],
  ])(
    "does not send old %s content when the edited %s is cleared",
    async (taskType, placeholder) => {
      const task = {
        id: "task",
        task_type: taskType,
        status: "pending",
        payload: {
          to: "customer@example.test",
          subject: "Original Subject",
          body: "Original message",
        },
      };
      h.fetch.mockImplementation((url: string) =>
        Promise.resolve(json(url === "/api/triage" ? triage : { tasks: [task] })),
      );
      render(() => ApprovalInbox({}));
      h.effects[0]();
      await flush();
      const card = elements(render(() => ApprovalInbox({}))).find(
        (node) => node.props.task?.id === "task",
      )!;
      h.states = [];
      h.refs = [];
      const renderCard = () => render(() => (card.type as (props: Props) => ReactNode)(card.props));
      elements(renderCard()).find(
        (node) => node.type === "button" && textOf(node.props.children) === "Edit",
      )!.props.onClick!();
      elements(renderCard()).find((node) => node.props.placeholder === placeholder)!.props
        .onChange!({ target: { value: "   " } });
      h.fetch.mockClear();
      h.fetch.mockImplementation(() => Promise.resolve(json({ success: true })));
      elements(renderCard()).find(
        (node) => node.type === "button" && textOf(node.props.children).trim() === "Approve",
      )!.props.onClick!();
      await flush();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(textOf(renderCard())).toContain("before approving");
    },
  );
});

async function approvalCard(payload: Record<string, unknown>, taskType = "send_email") {
  const task = { id: "task", task_type: taskType, status: "pending", payload };
  h.fetch.mockImplementation((url: string) =>
    Promise.resolve(json(url === "/api/triage" ? triage : { tasks: [task] })),
  );
  render(() => ApprovalInbox({}));
  h.effects[0]();
  await flush();
  const card = elements(render(() => ApprovalInbox({}))).find(
    (node) => node.props.task?.id === "task",
  )!;
  h.states = [];
  h.refs = [];
  h.fetch.mockClear();
  let currentTask = task;
  const draw = () =>
    render(() => (card.type as (props: Props) => ReactNode)({ ...card.props, task: currentTask }));
  return {
    draw,
    refresh(payload: Record<string, unknown>) {
      currentTask = { ...task, payload };
    },
    click(label: string) {
      elements(draw()).find(
        (node) => node.type === "button" && textOf(node.props.children).trim() === label,
      )!.props.onClick!();
    },
    change(placeholder: string, value: string) {
      elements(draw()).find((node) => node.props.placeholder === placeholder)!.props.onChange!({
        target: { value },
      });
    },
  };
}

describe("approval preview integrity", () => {
  it("locks the visible draft until the approval request finishes", async () => {
    const card = await approvalCard({ subject: "Original", body: "Original message" });
    let finish!: (response: Response) => void;
    h.fetch.mockImplementation((_url: string, init: RequestInit) =>
      init.method === "PATCH"
        ? Promise.resolve(json({ success: true }))
        : new Promise<Response>((resolve) => {
            finish = resolve;
          }),
    );
    card.click("Edit");
    card.click("Approve");
    await flush();
    const fields = () =>
      elements(card.draw()).filter((node) => node.type === "input" || node.type === "textarea");
    expect(fields()).toHaveLength(3);
    expect(fields().every((node) => (node.props as { disabled?: boolean }).disabled)).toBe(true);
    finish(new Response(JSON.stringify({ error: "Review required" }), { status: 422 }));
    await flush();
    expect(fields().every((node) => !(node.props as { disabled?: boolean }).disabled)).toBe(true);
  });

  it.each([false, true])(
    "uses a refreshed server message in the preview and editor (local save: %s)",
    async (locallySaved) => {
      const card = await approvalCard({ subject: "Original", body: "Original message" });
      if (locallySaved) {
        h.fetch.mockImplementation((_url: string, init: RequestInit) =>
          Promise.resolve(
            init.method === "PATCH"
              ? json({ success: true })
              : new Response(JSON.stringify({ error: "Review required" }), { status: 422 }),
          ),
        );
        card.click("Edit");
        card.change("Write a message…", "Locally saved message");
        card.click("Approve");
        await flush();
        card.click("Cancel");
        expect(textOf(card.draw())).toContain("Locally saved message");
      }
      card.refresh({ subject: "Updated elsewhere", body: "Current server message" });
      expect(textOf(card.draw())).toContain("Updated elsewhere");
      expect(textOf(card.draw())).toContain("Current server message");
      expect(textOf(card.draw())).not.toContain("Locally saved message");
      card.click("Edit");
      const message = elements(card.draw()).find(
        (node) => node.props.placeholder === "Write a message…",
      )!;
      expect((message.props as { value?: string }).value).toBe("Current server message");
    },
  );

  it("preserves an open edit during refresh and cancels to the latest server draft", async () => {
    const card = await approvalCard({ subject: "Original", body: "Original message" });
    card.click("Edit");
    card.change("Write a message…", "Unsaved message");
    card.refresh({ subject: "Updated elsewhere", body: "Current server message" });
    const message = elements(card.draw()).find(
      (node) => node.props.placeholder === "Write a message…",
    )!;
    expect((message.props as { value?: string }).value).toBe("Unsaved message");
    card.click("Cancel");
    expect(textOf(card.draw())).toContain("Current server message");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("shows the subject and the complete message before approval", async () => {
    const body = `${"Long message. ".repeat(60)}Final terms must be reviewed.`;
    const card = await approvalCard({ subject: "Exact subject", to: "person@example.test", body });
    expect(textOf(card.draw())).toContain("Exact subject");
    expect(textOf(card.draw())).toContain(body);
    expect(textOf(card.draw())).toContain("person@example.test");
  });

  it("does not offer an unused subject for a text message", async () => {
    const card = await approvalCard({ to: "+13125550100", body: "Hello" }, "send_text_message");
    card.click("Edit");
    expect(elements(card.draw()).some((node) => node.props.placeholder === "Subject")).toBe(false);
  });

  it("discards unsaved changes on Cancel", async () => {
    const card = await approvalCard({ subject: "Original", body: "Saved message" });
    card.click("Edit");
    card.change("Write a message…", "Unsaved change");
    card.click("Cancel");
    card.click("Edit");
    const message = elements(card.draw()).find(
      (node) => node.props.placeholder === "Write a message…",
    )!;
    expect((message.props as { value?: string }).value).toBe("Saved message");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps the preview aligned with the saved draft after a block (saved: %s)",
    async (saved) => {
      const card = await approvalCard({ subject: "Original", body: "Original message" });
      h.fetch.mockImplementation((_url: string, init: RequestInit) =>
        Promise.resolve(
          init.method === "PATCH" && saved
            ? json({ success: true })
            : new Response(JSON.stringify({ error: saved ? "Review required" : "Save failed" }), {
                status: 422,
              }),
        ),
      );
      card.click("Edit");
      card.change("Subject", "Revised subject");
      card.change("Write a message…", "Revised message");
      card.click("Approve");
      await flush();
      card.click("Cancel");
      expect(textOf(card.draw())).toContain(saved ? "Revised subject" : "Original");
      expect(textOf(card.draw())).toContain(saved ? "Revised message" : "Original message");
      expect(h.fetch).toHaveBeenCalledTimes(saved ? 2 : 1);
    },
  );
});
