import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmsOutcomePanel from "../src/components/SmsOutcomePanel";
import { emailOutcomeOperations } from "../src/lib/conversation-outcome-operations";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  layoutEffects: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

// The repository's node-only component harness preserves effects and cleanup
// so the actual handlers can be exercised across navigation and remounts.
vi.mock("react", async (original) => {
  const changed = (before?: readonly unknown[], after?: readonly unknown[]) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((value, i) => !Object.is(value, before[i]));
  const memo = (factory: () => unknown, dependencies?: readonly unknown[]) => {
    const index = h.cursor++;
    if (!h.slots[index] || changed(h.slots[index].dependencies, dependencies)) {
      h.slots[index] = { value: factory(), dependencies };
    }
    return h.slots[index].value;
  };
  const effect = (
    callback: () => void | (() => void),
    dependencies: readonly unknown[] | undefined,
    queue: Array<() => void>,
  ) => {
    const index = h.cursor++;
    const slot = h.slots[index] ?? {};
    if (changed(slot.dependencies, dependencies)) {
      slot.dependencies = dependencies;
      queue.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
    h.slots[index] = slot;
  };
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        h.slots[index].value,
        (next: unknown) => {
          const value = typeof next === "function" ? next(h.slots[index].value) : next;
          if (!Object.is(value, h.slots[index].value)) {
            h.slots[index].value = value;
            h.dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: { current: initial } };
      return h.slots[index].value;
    },
    useMemo: memo,
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      memo(() => callback, dependencies),
    useEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, h.effects),
    useLayoutEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, h.layoutEffects),
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Badge: "badge", Button: "button" }));
vi.mock("../src/components/molecules", () => ({
  ConversationActivity: "conversation-activity",
  StatusNotice: "status-notice",
}));

type Props = { children?: ReactNode; title?: string; disabled?: boolean; onClick?: () => void };
type Element = ReactElement<Props>;
let tree: ReactNode;
let threadId: string;
let initialStatus: string;
let reads: Array<() => Promise<Response>>;
let writes: Array<() => Promise<Response>>;
let server: Map<string, { status: string; handoff: { id: string; status: string } | null }>;
let changedStatus: ReturnType<typeof vi.fn>;
const response = (body: Record<string, unknown>, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("SMS outcome render did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.layoutEffects = [];
    h.effects = [];
    tree = SmsOutcomePanel({ threadId, initialStatus, onStatusChange: changedStatus });
    h.layoutEffects.forEach((run) => run());
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 24; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function unmount() {
  h.slots.forEach((slot) => slot.cleanup?.());
  h.slots = [];
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(label: string) {
  const node = elements(tree).find((node) => node.type === "button" && text(node) === label);
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
const patches = () => h.fetch.mock.calls.filter(([, options]) => options?.method === "PATCH");
const saved = (status: string, id = "thread-a") =>
  response({
    thread: { id, status },
    handoff_task_id: status === "escalated" ? `handoff-${id}` : null,
  });

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.fetch.mockReset();
  threadId = "thread-a";
  initialStatus = "open";
  reads = [];
  writes = [];
  server = new Map([[threadId, { status: "open", handoff: null }]]);
  changedStatus = vi.fn((status: string) => {
    if (initialStatus !== status) {
      initialStatus = status;
      h.dirty = true;
    }
  });
  h.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    const id = url.split("/")[4];
    if (options?.method === "PATCH") {
      const payload = JSON.parse(String(options.body));
      const result = await (writes.shift()?.() ?? saved(payload.status, id));
      if (result.ok) {
        const body = await result.json();
        server.set(id, {
          status: body.thread.status,
          handoff: body.handoff_task_id ? { id: body.handoff_task_id, status: "pending" } : null,
        });
      }
      return result;
    }
    return (
      reads.shift()?.() ??
      response({
        thread: { id, status: server.get(id)?.status ?? "open" },
        handoff: server.get(id)?.handoff ?? null,
      })
    );
  });
});
afterEach(unmount);

describe("text outcome navigation", () => {
  it("keeps an email save separate from a pending text save", async () => {
    const pending = deferred();
    writes = [() => pending.promise];
    await settle();
    button("Resolve").props.onClick?.();
    await settle();
    await emailOutcomeOperations.save(threadId, "booked");
    await settle();
    const textStillBusy = button("Booked").props.disabled;
    const before = elements(tree).find((node) => node.type === "badge");
    const beforeStatus = text(before);
    pending.resolve(saved("resolved"));
    await settle();
    expect(textStillBusy).toBe(true);
    expect(beforeStatus).toBe("Needs review");
    expect(patches().map(([url]) => url)).toEqual([
      "/api/sms/threads/thread-a/outcome",
      "/api/emails/threads/thread-a/outcome",
    ]);
    expect(text(tree)).toContain("Resolved");
  });

  it.each([
    ["Resolve", "resolved"],
    ["Handoff", "escalated"],
  ])("keeps a pending %s owned after unmount and return", async (action, status) => {
    const pending = deferred();
    writes = [() => pending.promise];
    await settle();
    button(action).props.onClick?.();
    await settle();
    const originalSignal = patches()[0][1].signal;
    unmount();
    await settle();
    const disabled = button("Booked").props.disabled;
    button("Booked").props.onClick?.();
    await settle();
    const count = patches().length;
    pending.resolve(saved(status));
    await settle();
    expect(originalSignal?.aborted ?? false).toBe(false);
    expect(disabled).toBe(true);
    expect(count).toBe(1);
    expect(button("Booked").props.disabled).toBe(false);
    expect(text(tree)).toContain(status === "resolved" ? "Resolved" : "Handoff");
    expect(elements(tree).some((node) => node.props.title === "Human Follow-Up Is Active")).toBe(
      status === "escalated",
    );
  });

  it("ignores a second action invoked before the pending render", async () => {
    const pending = deferred();
    writes = [() => pending.promise];
    await settle();
    const first = button("Resolve");
    const second = button("Booked");
    first.props.onClick?.();
    second.props.onClick?.();
    await settle();
    const count = patches().length;
    pending.resolve(saved("resolved"));
    await settle();
    expect(count).toBe(1);
    expect(text(tree)).toContain("Resolved");
  });

  it("rejects an older read arriving after the save completes", async () => {
    const pending = deferred();
    const oldRead = deferred();
    writes = [() => pending.promise];
    await settle();
    button("Handoff").props.onClick?.();
    await settle();
    unmount();
    reads = [() => oldRead.promise];
    await settle();
    pending.resolve(saved("escalated"));
    await settle();
    oldRead.resolve(response({ thread: { id: threadId, status: "open" }, handoff: null }));
    await settle();
    expect(text(tree)).toContain("Handoff");
    expect(elements(tree).some((node) => node.props.title === "Human Follow-Up Is Active")).toBe(
      true,
    );
    expect(changedStatus.mock.calls.at(-1)?.[0]).toBe("escalated");
  });

  it("keeps the confirmed handoff if the follow-up read fails", async () => {
    await settle();
    reads = [() => Promise.resolve(response({ error: "Outcome refresh unavailable" }, 503))];
    button("Handoff").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Outcome refresh unavailable");
    expect(elements(tree).some((node) => node.props.title === "Human Follow-Up Is Active")).toBe(
      true,
    );
    expect(button("Booked").props.disabled).toBe(false);
  });

  it("releases a failed save after returning and allows retry", async () => {
    const pending = deferred();
    writes = [() => pending.promise];
    await settle();
    button("Resolve").props.onClick?.();
    await settle();
    unmount();
    await settle();
    pending.resolve(response({ error: "Save interrupted. Try again." }, 503));
    await settle();
    const failure = text(tree);
    const disabled = button("Resolve").props.disabled;
    button("Resolve").props.onClick?.();
    await settle();
    expect(failure).toContain("Save interrupted. Try again.");
    expect(disabled).toBe(false);
    expect(patches()).toHaveLength(2);
    expect(text(tree)).toContain("Resolved");
  });

  it("does not put an old conversation's completion on another conversation", async () => {
    const pending = deferred();
    writes = [() => pending.promise];
    await settle();
    button("Handoff").props.onClick?.();
    await settle();
    threadId = "thread-b";
    initialStatus = "open";
    await settle();
    changedStatus.mockClear();
    pending.resolve(saved("escalated", "thread-a"));
    await settle();
    expect(changedStatus).not.toHaveBeenCalled();
    expect(text(tree)).toContain("Needs review");
    expect(elements(tree).some((node) => node.props.title === "Human Follow-Up Is Active")).toBe(
      false,
    );
    expect(button("Booked").props.disabled).toBe(false);
  });
});
