import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailInbox from "../src/components/EmailInbox";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  layoutEffects: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

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
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({
  Badge: "badge",
  Button: "button",
  EmptyState: "empty-state",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({
  ConversationActivity: "conversation-activity",
  ConversationMessage: "conversation-message",
  SearchField: "search-field",
  StatusNotice: "status-notice",
}));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  description?: string;
  tone?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "data-empty"?: string;
  onClick?: () => void;
  onBack?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onClear?: () => void;
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let agentId: string | null;
let accountId: string | null;
let channelEnabled: boolean;
let channelAccessResolved: boolean;
let listResponses: Array<() => Promise<Response>>;
let syncResponses: Array<() => Promise<Response>>;
let detailResponses: Array<() => Promise<Response>>;
let readResponses: Array<() => Promise<Response>>;
let threads: Array<Record<string, unknown>>;
let savedHandoffs: Map<string, unknown>;
const response = (body: Record<string, unknown>, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("Email render did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.effects = [];
    h.layoutEffects = [];
    tree = EmailInbox({
      embedded: true,
      agentId,
      accountId,
      channelEnabled,
      channelAccessResolved,
    });
    h.layoutEffects.forEach((run) => run());
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(label: string) {
  const found = elements(tree).find(
    (node) =>
      node.type === "button" && (node.props["aria-label"] === label || text(node) === label),
  );
  if (!found) throw new Error(`Missing ${label} button`);
  return found;
}
function errors() {
  return elements(tree).filter((node) => node.props.title === "Inbox Unavailable");
}
function successes() {
  return elements(tree).filter(
    (node) => node.type === "status-notice" && node.props.tone === "success",
  );
}
function requests(path: string) {
  return h.fetch.mock.calls.filter(([url]) => String(url).startsWith(path));
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.fetch.mockReset();
  agentId = null;
  accountId = null;
  channelEnabled = true;
  channelAccessResolved = false;
  threads = [];
  savedHandoffs = new Map();
  listResponses = [];
  syncResponses = [];
  detailResponses = [];
  readResponses = [];
  h.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/emails/accounts") return response({ accounts: [{ id: "mailbox" }] });
    if (url === "/api/emails/sync") {
      const next = syncResponses.shift();
      if (!next) throw new Error("Unexpected mailbox sync");
      return next();
    }
    if (url === "/api/emails/threads/read-state")
      return readResponses.shift()?.() ?? response({ success: true });
    if (/\/api\/emails\/threads\/[^/]+\/outcome$/.test(url)) {
      const threadId = url.split("/")[4];
      const result = await (detailResponses.shift()?.() ??
        response({
          thread: threads.find((thread) => thread.id === threadId) ?? threads[0],
          messages: [],
          handoff: savedHandoffs.get(threadId) ?? null,
        }));
      if (options?.method === "PATCH" && result.ok) {
        const body = await result.json();
        if (body.thread) {
          savedHandoffs.set(body.thread.id, body.handoff ?? null);
          threads = threads.map((thread) =>
            thread.id === body.thread.id ? { ...thread, ...body.thread } : thread,
          );
        }
      }
      return result;
    }
    if (url.startsWith("/api/emails/threads"))
      return listResponses.shift()?.() ?? response({ threads });
    throw new Error(`Unexpected endpoint ${url}`);
  });
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("email inbox operation recovery", () => {
  it("hides an empty inbox while Email access is pending or excluded", async () => {
    channelEnabled = false;
    await settle();
    expect(tree).toBeNull();
    channelAccessResolved = true;
    await settle();
    expect(tree).toBeNull();
    expect(requests("/api/emails/threads")).toHaveLength(1);
  });

  it("preserves loading and retry when an excluded inbox has not confirmed its history", async () => {
    channelEnabled = false;
    channelAccessResolved = true;
    const pending = deferred();
    listResponses = [() => pending.promise];
    await settle();
    expect(tree).not.toBeNull();
    pending.resolve(response({ error: "Temporary inbox failure" }, 503));
    await settle();
    expect(errors()).toHaveLength(1);
    button("Retry").props.onClick?.();
    await settle();
    expect(tree).toBeNull();
  });

  it("preserves retained conversations and search after Email is removed from the plan", async () => {
    channelEnabled = false;
    channelAccessResolved = true;
    threads = [
      { id: "thread-1", subject: "Retained conversation", customer_email: "jordan@example.test" },
    ];
    await settle();
    expect(text(tree)).toContain("Retained conversation");
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onChange?.({ target: { value: "missing" } });
    await settle();
    expect(tree).not.toBeNull();
    expect(button("Refresh email")).toBeDefined();
  });

  it("returns to search results when the selected email no longer matches and ignores its late detail", async () => {
    threads = [
      { id: "thread-1", subject: "Appointment", customer_email: "jordan@example.test" },
      { id: "thread-2", subject: "Proposal", customer_email: "taylor@example.test" },
    ];
    const pending = deferred();
    detailResponses = [() => pending.promise];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && text(node).includes("jordan@example.test"))
      ?.props.onClick?.();
    await settle();
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onChange?.({ target: { value: "taylor" } });
    await settle();
    expect(elements(tree).some((node) => node.props.onBack)).toBe(false);
    expect(text(tree)).toContain("taylor@example.test");
    pending.resolve(
      response({
        thread: threads[0],
        messages: [{ id: "late", content: "Old customer's message" }],
      }),
    );
    await settle();
    expect(text(tree)).not.toContain("Old customer's message");
    expect(button("Refresh email").props.disabled).toBe(false);
  });

  it("keeps a matching email selected through edits and clearing the search", async () => {
    threads = [{ id: "thread-1", subject: "Appointment", customer_email: "jordan@example.test" }];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
      ?.props.onClick?.();
    await settle();
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onChange?.({ target: { value: " JORDAN " } });
    await settle();
    expect(elements(tree).some((node) => node.props.onBack)).toBe(true);
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onClear?.();
    await settle();
    expect(elements(tree).some((node) => node.props.onBack)).toBe(true);
  });

  it.each([
    ["open", "Needs Review"],
    ["escalated", "Handoff"],
  ])("finds %s emails by the visible %s label", async (status, label) => {
    threads = [
      { id: "thread-1", subject: "Appointment", customer_email: "jordan@example.test", status },
      {
        id: "thread-2",
        subject: "Proposal",
        customer_email: "taylor@example.test",
        status: "resolved",
      },
    ];
    await settle();
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onChange?.({ target: { value: label } });
    await settle();
    expect(text(tree)).toContain("jordan@example.test");
    expect(text(tree)).not.toContain("taylor@example.test");
  });

  it("releases refresh when returning to the list during a pending detail load", async () => {
    const pending = deferred();
    threads = [{ id: "thread-1", subject: "Appointment" }];
    detailResponses = [() => pending.promise];
    syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
      ?.props.onClick?.();
    await settle();
    elements(tree)
      .find((node) => node.props.onBack)
      ?.props.onBack?.();
    await settle();
    expect(button("Refresh email").props.disabled).toBe(false);
    button("Refresh email").props.onClick?.();
    await settle();
    expect(requests("/api/emails/sync")).toHaveLength(1);
    pending.resolve(
      response({ thread: threads[0], messages: [{ id: "late", content: "Superseded body" }] }),
    );
    await settle();
    expect(text(tree)).not.toContain("Superseded body");
    expect(button("Refresh email").props.disabled).toBe(false);
  });

  it("retries provider synchronization rather than hiding its failure with a thread-list read", async () => {
    syncResponses = [
      () => Promise.resolve(response({ error: "Mailbox unreachable" }, 502)),
      () => Promise.resolve(response({ error: "Still unreachable" }, 502)),
    ];
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    expect(errors()).toHaveLength(1);
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/emails/sync")).toHaveLength(2);
    expect(requests("/api/emails/threads")).toHaveLength(1);
    expect(errors()).toHaveLength(1);
  });

  it("retries only the thread list when that is the operation that failed", async () => {
    listResponses = [() => Promise.resolve(response({ error: "List unavailable" }, 503))];
    await settle();
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/emails/threads")).toHaveLength(2);
    expect(requests("/api/emails/sync")).toHaveLength(0);
    expect(errors()).toHaveLength(0);
  });

  it("clears the previous success notice when another refresh begins and fails", async () => {
    const pending = deferred();
    syncResponses = [
      () => Promise.resolve(response({ message: "Inbox refreshed." })),
      () => pending.promise,
    ];
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    expect(successes()).toHaveLength(1);
    button("Refresh email").props.onClick?.();
    await settle();
    expect(successes()).toHaveLength(0);
    pending.resolve(response({ error: "Mailbox unreachable" }, 502));
    await settle();
    expect(successes()).toHaveLength(0);
    expect(errors()).toHaveLength(1);
  });

  it("preserves existing conversations and offers the matching retry after a sync failure", async () => {
    threads = [
      { id: "thread-1", subject: "Existing conversation", customer_email: "customer@example.test" },
    ];
    syncResponses = [
      () => Promise.resolve(response({ error: "Mailbox unreachable" }, 502)),
      () => Promise.resolve(response({ message: "Inbox refreshed." })),
    ];
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Existing conversation");
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/emails/sync")).toHaveLength(2);
    expect(text(tree)).toContain("Existing conversation");
    expect(errors()).toHaveLength(0);
  });

  it("ignores a late sync failure after the selected Bot changes", async () => {
    const pending = deferred();
    syncResponses = [() => pending.promise];
    agentId = "bot-a";
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    agentId = "bot-b";
    await settle();
    pending.resolve(response({ error: "Old scope failure" }, 502));
    await settle();
    expect(errors()).toHaveLength(0);
    expect(successes()).toHaveLength(0);
    const latest = new URL(String(requests("/api/emails/threads").at(-1)?.[0]), "http://local");
    expect(latest.searchParams.get("agent_id")).toBe("bot-b");
    expect(latest.searchParams.has("cursor")).toBe(false);
    expect(latest.searchParams.has("offset")).toBe(false);
  });

  it("does not announce refresh success when the refreshed conversation list fails to load", async () => {
    syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
    await settle();
    listResponses = [() => Promise.resolve(response({ error: "List unavailable" }, 503))];
    button("Refresh email").props.onClick?.();
    await settle();
    expect(errors()).toHaveLength(1);
    expect(successes()).toHaveLength(0);
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/emails/sync")).toHaveLength(1);
    expect(errors()).toHaveLength(0);
  });

  it("keeps the message body and handoff when the active conversation is clicked again", async () => {
    threads = [{ id: "thread-1", subject: "Appointment", customer_email: "customer@example.test" }];
    detailResponses = [
      () =>
        Promise.resolve(
          response({
            thread: threads[0],
            messages: [{ id: "message-1", content: "Please keep this visible." }],
            handoff: { id: "handoff-1", status: "pending" },
          }),
        ),
    ];
    await settle();
    const row = () =>
      elements(tree).find(
        (node) => node.type === "button" && typeof node.props["aria-pressed"] === "boolean",
      )!;
    row().props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Please keep this visible.");
    row().props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Please keep this visible.");
    expect(requests("/api/emails/threads/thread-1/outcome")).toHaveLength(1);
  });

  it("refreshes the open conversation after sync while keeping its current body visible", async () => {
    const pending = deferred();
    threads = [{ id: "thread-1", subject: "Appointment" }];
    detailResponses = [
      () =>
        Promise.resolve(
          response({ thread: threads[0], messages: [{ id: "old", content: "Original message" }] }),
        ),
      () => pending.promise,
    ];
    syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
      ?.props.onClick?.();
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    expect(requests("/api/emails/threads/thread-1/outcome")).toHaveLength(2);
    expect(text(tree)).toContain("Original message");
    expect(successes()).toHaveLength(0);
    expect(button("Resolved").props.disabled).toBe(true);
    button("Resolved").props.onClick?.();
    await settle();
    expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
    pending.resolve(
      response({
        thread: threads[0],
        messages: [{ id: "new", content: "New reply just received" }],
      }),
    );
    await settle();
    expect(text(tree)).toContain("New reply just received");
    expect(successes()).toHaveLength(1);
  });

  it("does not start a refresh while saving the conversation outcome", async () => {
    const pending = deferred();
    threads = [{ id: "thread-1", subject: "Appointment" }];
    detailResponses = [
      () => Promise.resolve(response({ thread: threads[0], messages: [] })),
      () => pending.promise,
    ];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
      ?.props.onClick?.();
    await settle();
    button("Resolved").props.onClick?.();
    await settle();
    expect(button("Refresh email").props.disabled).toBe(true);
    button("Refresh email").props.onClick?.();
    await settle();
    expect(requests("/api/emails/sync")).toHaveLength(0);
    pending.resolve(response({ thread: { ...threads[0], status: "resolved" } }));
    await settle();
    expect(button("Refresh email").props.disabled).toBe(false);
  });

  it.each(["Resolved", "Handoff"])(
    "releases refresh when returning to the list during a pending outcome: %s",
    async (action) => {
      const pending = deferred();
      threads = [
        { id: "thread-1", subject: "First Appointment" },
        { id: "thread-2", subject: "Second Appointment" },
      ];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
        () =>
          Promise.resolve(
            response({
              thread: threads[1],
              messages: [{ id: "second-message", content: "Second conversation body" }],
            }),
          ),
      ];
      syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
      await settle();
      const row = (subject: string) =>
        elements(tree).find(
          (node) =>
            node.type === "button" &&
            typeof node.props["aria-pressed"] === "boolean" &&
            text(node).includes(subject),
        )!;
      row("First Appointment").props.onClick?.();
      await settle();
      button(action).props.onClick?.();
      await settle();
      expect(button("Refresh email").props.disabled).toBe(true);
      elements(tree)
        .find((node) => node.props.onBack)
        ?.props.onBack?.();
      await settle();

      expect(button("Refresh email").props.disabled).toBe(false);
      button("Refresh email").props.onClick?.();
      await settle();
      expect(requests("/api/emails/sync")).toHaveLength(1);
      row("Second Appointment").props.onClick?.();
      await settle();
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "old-handoff", status: "pending" } : null,
        }),
      );
      await settle();

      expect(text(tree)).toContain("Second conversation body");
      expect(button("Resolved").props.disabled).toBe(false);
      expect(button("Handoff").props.disabled).toBe(false);
      expect(button("Refresh email").props.disabled).toBe(false);
      expect(successes()).toHaveLength(0);
    },
  );

  it.each(["Resolved", "Handoff"])(
    "keeps same-thread saves serialized when reopening a conversation during %s",
    async (action) => {
      const pending = deferred();
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () =>
          Promise.resolve(
            response({
              thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
              messages: [],
              handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
            }),
          ),
        () => Promise.resolve(response({ thread: { ...threads[0], status: "booked" } })),
      ];
      const openThread = () =>
        elements(tree)
          .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
          ?.props.onClick?.();
      await settle();
      openThread();
      await settle();
      button(action).props.onClick?.();
      await settle();
      elements(tree)
        .find((node) => node.props.onBack)
        ?.props.onBack?.();
      await settle();
      openThread();
      await settle();
      expect(button("Booked").props.disabled).toBe(true);
      button("Booked").props.onClick?.();
      await settle();
      expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(
        1,
      );

      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "old-handoff", status: "pending" } : null,
        }),
      );
      await settle();

      expect(button("Booked").props.disabled).toBe(false);
      expect(button(action).props.disabled).toBe(true);
      expect(successes()).toHaveLength(0);
      button("Booked").props.onClick?.();
      await settle();

      expect(button("Booked").props.disabled).toBe(true);
      expect(button("Resolved").props.disabled).toBe(false);
      expect(button("Handoff").props.disabled).toBe(false);
      expect(successes()).toHaveLength(0);
      const currentRow = elements(tree).find(
        (node) => node.type === "button" && node.props["aria-pressed"] === true,
      );
      expect(text(currentRow)).toContain("Booked");
      expect(text(currentRow)).not.toContain(action);
    },
  );

  it.each(["Resolved", "Handoff"])(
    "updates the list when %s finishes after returning from a conversation",
    async (action) => {
      const pending = deferred();
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
      ];
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
        ?.props.onClick?.();
      await settle();
      button(action).props.onClick?.();
      await settle();
      elements(tree)
        .find((node) => node.props.onBack)
        ?.props.onBack?.();
      await settle();
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();

      const row = elements(tree).find(
        (node) => node.type === "button" && node.props["aria-pressed"] === false,
      );
      expect(text(row)).toContain(action);
      expect(text(row)).not.toContain("Needs review");
      expect(successes()).toHaveLength(0);
      expect(button("Refresh email").props.disabled).toBe(false);
    },
  );

  it.each(["Resolved", "Handoff"])(
    "shows a failed pending %s after reopening and permits a new save",
    async (action) => {
      const pending = deferred();
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => Promise.resolve(response({ thread: { ...threads[0], status: "booked" } })),
      ];
      const openThread = () =>
        elements(tree)
          .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
          ?.props.onClick?.();
      await settle();
      openThread();
      await settle();
      button(action).props.onClick?.();
      await settle();
      elements(tree)
        .find((node) => node.props.onBack)
        ?.props.onBack?.();
      await settle();
      openThread();
      await settle();
      expect(button("Booked").props.disabled).toBe(true);

      pending.resolve(response({ error: "Outcome could not be saved." }, 503));
      await settle();
      expect(text(tree)).toContain("Outcome could not be saved.");
      expect(button("Booked").props.disabled).toBe(false);
      button("Booked").props.onClick?.();
      await settle();
      expect(button("Booked").props.disabled).toBe(true);
      expect(text(tree)).not.toContain("Outcome could not be saved.");
    },
  );

  it.each(["Resolved", "Handoff"])(
    "keeps the committed %s visible if reconciliation fails after reopening",
    async (action) => {
      const pending = deferred();
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () =>
          Promise.resolve(response({ error: "Could not refresh the saved conversation." }, 503)),
      ];
      const openThread = () =>
        elements(tree)
          .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
          ?.props.onClick?.();
      await settle();
      openThread();
      await settle();
      button(action).props.onClick?.();
      await settle();
      elements(tree)
        .find((node) => node.props.onBack)
        ?.props.onBack?.();
      await settle();
      openThread();
      await settle();
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();
      expect(button(action).props.disabled).toBe(true);
      expect(text(tree)).toContain("Could not refresh the saved conversation.");
      expect(button("Booked").props.disabled).toBe(false);
    },
  );

  it.each(["Resolved", "Handoff"])(
    "keeps a pending %s save owned across an Inbox unmount and remount",
    async (action) => {
      const pending = deferred();
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
      ];
      const openThread = () =>
        elements(tree)
          .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
          ?.props.onClick?.();
      await settle();
      openThread();
      await settle();
      button(action).props.onClick?.();
      await settle();
      h.slots.forEach((slot) => slot.cleanup?.());
      h.slots = [];
      await settle();
      openThread();
      await settle();
      const bookedDisabled = button("Booked").props.disabled;
      button("Booked").props.onClick?.();
      await settle();
      const patchCount = h.fetch.mock.calls.filter(
        ([, options]) => options?.method === "PATCH",
      ).length;
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();
      expect(bookedDisabled).toBe(true);
      expect(patchCount).toBe(1);
      expect(button(action).props.disabled).toBe(true);
      expect(button("Booked").props.disabled).toBe(false);
    },
  );

  it.each(["Resolved", "Handoff"])(
    "updates a matching row in a broader scope after a pending %s save",
    async (action) => {
      const pending = deferred();
      agentId = "agent-1";
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
      ];
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
        ?.props.onClick?.();
      await settle();
      button(action).props.onClick?.();
      await settle();
      agentId = null;
      await settle();
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();
      const row = elements(tree).find(
        (node) => node.type === "button" && node.props["aria-pressed"] === false,
      );
      expect(text(row)).toContain(action);
      expect(text(row)).not.toContain("Needs review");
    },
  );

  it.each(["Resolved", "Handoff"])(
    "does not let a broader-scope read replace a %s committed while it was loading",
    async (action) => {
      const pending = deferred();
      const broaderList = deferred();
      agentId = "agent-1";
      threads = [{ id: "thread-1", subject: "Appointment", status: "open" }];
      const oldThreads = threads.map((thread) => ({ ...thread }));
      detailResponses = [
        () => Promise.resolve(response({ thread: threads[0], messages: [] })),
        () => pending.promise,
      ];
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
        ?.props.onClick?.();
      await settle();
      button(action).props.onClick?.();
      await settle();
      listResponses = [() => broaderList.promise];
      agentId = null;
      await settle();
      pending.resolve(
        response({
          thread: { ...threads[0], status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();
      broaderList.resolve(response({ threads: oldThreads }));
      await settle();
      const row = elements(tree).find(
        (node) => node.type === "button" && node.props["aria-pressed"] === false,
      );
      expect(text(row)).toContain(action);
      expect(text(row)).not.toContain("Needs review");
    },
  );

  it.each([
    ["Resolved", true],
    ["Resolved", false],
    ["Handoff", true],
    ["Handoff", false],
  ] as const)(
    "preserves newer message fields when %s finishes (list arrives first: %s)",
    async (action, listArrivesFirst) => {
      const pending = deferred();
      const broaderList = deferred();
      agentId = "agent-1";
      const original = {
        id: "thread-1",
        subject: "Original appointment",
        customer_email: "original@example.test",
        summary: "Original preview",
        last_message_at: "2026-09-20T10:00:00Z",
        status: "open",
      };
      const latest = {
        ...original,
        subject: "Updated appointment",
        customer_email: "latest@example.test",
        summary: "Latest customer reply",
        last_message_at: "2026-09-21T11:30:00Z",
      };
      threads = [original];
      detailResponses = [
        () => Promise.resolve(response({ thread: original, messages: [] })),
        () => pending.promise,
      ];
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
        ?.props.onClick?.();
      await settle();
      button(action).props.onClick?.();
      await settle();
      listResponses = [() => broaderList.promise];
      agentId = null;
      await settle();
      if (listArrivesFirst) {
        broaderList.resolve(response({ threads: [latest] }));
        await settle();
      }
      pending.resolve(
        response({
          thread: { ...original, status: action === "Handoff" ? "escalated" : "resolved" },
          handoff: action === "Handoff" ? { id: "saved-handoff", status: "pending" } : null,
        }),
      );
      await settle();
      if (!listArrivesFirst) {
        broaderList.resolve(response({ threads: [latest] }));
        await settle();
      }
      const row = elements(tree).find(
        (node) => node.type === "button" && node.props["aria-pressed"] === false,
      );
      expect(text(row)).toContain(action);
      expect(text(row)).toContain(latest.subject);
      expect(text(row)).toContain(latest.customer_email);
      expect(text(row)).toContain(
        new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(latest.last_message_at)),
      );
      elements(tree)
        .find((node) => node.type === "search-field")
        ?.props.onChange?.({ target: { value: latest.summary } });
      await settle();
      expect(text(tree)).toContain(latest.subject);
    },
  );

  it("preserves the open body and retries only its failed refresh without claiming success", async () => {
    threads = [{ id: "thread-1", subject: "Appointment" }];
    detailResponses = [
      () =>
        Promise.resolve(
          response({ thread: threads[0], messages: [{ id: "old", content: "Original message" }] }),
        ),
      () => Promise.resolve(response({ error: "Conversation temporarily unavailable" }, 503)),
      () =>
        Promise.resolve(
          response({ thread: threads[0], messages: [{ id: "new", content: "Recovered reply" }] }),
        ),
    ];
    syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
    await settle();
    elements(tree)
      .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
      ?.props.onClick?.();
    await settle();
    button("Refresh email").props.onClick?.();
    await settle();
    expect(successes()).toHaveLength(0);
    expect(text(tree)).toContain("Original message");
    expect(text(tree)).toContain("Conversation temporarily unavailable");
    button("Retry Conversation").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Recovered reply");
    expect(text(tree)).not.toContain("Conversation temporarily unavailable");
    expect(requests("/api/emails/sync")).toHaveLength(1);
  });

  it("loads older conversations and scopes search to the emails loaded so far", async () => {
    listResponses = [
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "first", subject: "Latest" }],
            hasMore: true,
            nextCursor: "older-page",
          }),
        ),
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "older", subject: "Old appointment" }],
            hasMore: false,
            nextCursor: null,
          }),
        ),
    ];
    await settle();
    elements(tree)
      .find((node) => node.type === "search-field")
      ?.props.onChange?.({ target: { value: "Old appointment" } });
    await settle();
    expect(elements(tree).some((node) => node.props.title === "No Matches in 1 Loaded Email")).toBe(
      true,
    );
    button("Load More Email").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Old appointment");
    const latest = new URL(String(requests("/api/emails/threads").at(-1)?.[0]), "http://local");
    expect(latest.searchParams.get("cursor")).toBe("older-page");
    expect(latest.searchParams.has("offset")).toBe(false);
    expect(
      elements(tree).some((node) => node.type === "button" && text(node) === "Load More Email"),
    ).toBe(false);
  });

  it.each([false, true])(
    "keeps the selected older conversation through a first-page refresh (empty page: %s)",
    async (emptyPage) => {
      const older = { id: "older", subject: "Older appointment" };
      listResponses = [
        () =>
          Promise.resolve(
            response({
              threads: [{ id: "first", subject: "Latest" }],
              hasMore: true,
              nextCursor: "older-page",
            }),
          ),
        () => Promise.resolve(response({ threads: [older], hasMore: false })),
        () =>
          Promise.resolve(
            response({
              threads: emptyPage ? [] : [{ id: "new", subject: "New arrival" }],
              hasMore: !emptyPage,
              nextCursor: emptyPage ? null : "refreshed-page",
            }),
          ),
      ];
      detailResponses = [
        () =>
          Promise.resolve(
            response({
              thread: older,
              messages: [{ id: "message-older", content: "Keep this older conversation open." }],
              handoff: { id: "handoff-older", status: "pending" },
            }),
          ),
      ];
      detailResponses.push(detailResponses[0]);
      syncResponses = [() => Promise.resolve(response({ message: "Inbox refreshed." }))];
      await settle();
      button("Load More Email").props.onClick?.();
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && text(node).includes("Older appointment"))
        ?.props.onClick?.();
      await settle();
      expect(text(tree)).toContain("Keep this older conversation open.");

      button("Refresh email").props.onClick?.();
      await settle();

      expect(text(tree)).toContain("Older appointment");
      expect(text(tree)).toContain("Keep this older conversation open.");
      expect(elements(tree).some((node) => node.props.title === "Handoff")).toBe(true);
      expect(elements(tree).some((node) => node.props["data-empty"] === "true")).toBe(false);
      expect(requests("/api/emails/threads/older/outcome")).toHaveLength(2);
      const latest = new URL(String(requests("/api/emails/threads?").at(-1)?.[0]), "http://local");
      expect(latest.searchParams.has("cursor")).toBe(false);
    },
  );

  it.each(["Bot", "mailbox"])(
    "clears selected details when the %s scope changes",
    async (scope) => {
      agentId = "bot-a";
      accountId = "mailbox-a";
      threads = [{ id: "old", subject: "Previous scope" }];
      detailResponses = [
        () =>
          Promise.resolve(
            response({
              thread: threads[0],
              messages: [{ id: "old-message", content: "Previous scope body" }],
            }),
          ),
      ];
      await settle();
      elements(tree)
        .find((node) => node.type === "button" && node.props["aria-pressed"] === false)
        ?.props.onClick?.();
      await settle();
      expect(text(tree)).toContain("Previous scope body");
      threads = [{ id: "new", subject: "Current scope" }];
      if (scope === "Bot") agentId = "bot-b";
      else accountId = "mailbox-b";

      await settle();

      expect(text(tree)).not.toContain("Previous scope body");
      expect(text(tree)).toContain("Current scope");
      expect(elements(tree).some((node) => node.props.title === "Select a Conversation")).toBe(
        true,
      );
    },
  );

  it("preserves loaded conversations and retries the failed older page", async () => {
    listResponses = [
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "first", subject: "Latest" }],
            hasMore: true,
            nextCursor: "older-page",
          }),
        ),
      () => Promise.resolve(response({ error: "Older mail unavailable" }, 503)),
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "older", subject: "Older" }],
            hasMore: false,
            nextCursor: null,
          }),
        ),
    ];
    await settle();
    button("Load More Email").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Latest");
    button("Retry Older Email").props.onClick?.();
    await settle();
    expect(text(tree)).toContain("Older");
    expect(requests("/api/emails/sync")).toHaveLength(0);
    const pageRequests = requests("/api/emails/threads?").slice(1);
    expect(pageRequests).toHaveLength(2);
    expect(
      pageRequests.map(([url]) => new URL(String(url), "http://local").searchParams.get("cursor")),
    ).toEqual(["older-page", "older-page"]);
  });

  it("discards an older page when the Bot filter changes", async () => {
    const pending = deferred();
    agentId = "bot-a";
    listResponses = [
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "first", subject: "Bot A" }],
            hasMore: true,
            nextCursor: "older-page",
          }),
        ),
      () => pending.promise,
      () =>
        Promise.resolve(response({ threads: [{ id: "new", subject: "Bot B" }], hasMore: false })),
    ];
    await settle();
    button("Load More Email").props.onClick?.();
    await settle();
    agentId = "bot-b";
    await settle();
    pending.resolve(
      response({ threads: [{ id: "old", subject: "Stale older email" }], hasMore: false }),
    );
    await settle();
    expect(text(tree)).toContain("Bot B");
    expect(text(tree)).not.toContain("Stale older email");
  });

  it.each([null, "older-page"])(
    "preserves the current page when the older response cannot advance its cursor (%s)",
    async (nextCursor) => {
      listResponses = [
        () =>
          Promise.resolve(
            response({
              threads: [{ id: "first", subject: "Latest" }],
              hasMore: true,
              nextCursor: "older-page",
            }),
          ),
        () =>
          Promise.resolve(
            response({
              threads: [{ id: "invalid", subject: "Unconfirmed page" }],
              hasMore: true,
              nextCursor,
            }),
          ),
      ];
      await settle();
      button("Load More Email").props.onClick?.();
      await settle();

      expect(text(tree)).toContain("Latest");
      expect(text(tree)).not.toContain("Unconfirmed page");
      expect(button("Retry Older Email")).toBeDefined();
    },
  );

  it("marks only the accepted conversation read without delaying its body", async () => {
    const oldDetail = deferred();
    const read = deferred();
    threads = [
      { id: "a", subject: "First" },
      { id: "b", subject: "Second" },
    ];
    detailResponses = [
      () => oldDetail.promise,
      () =>
        Promise.resolve(
          response({ thread: threads[1], messages: [{ id: "body-b", content: "Current body" }] }),
        ),
    ];
    readResponses = [() => read.promise];
    await settle();
    const rows = () =>
      elements(tree).filter(
        (node) => node.type === "button" && typeof node.props["aria-pressed"] === "boolean",
      );
    rows()[0].props.onClick?.();
    await settle();
    rows()[1].props.onClick?.();
    await settle();
    oldDetail.resolve(
      response({ thread: threads[0], messages: [{ id: "body-a", content: "Stale body" }] }),
    );
    await settle();
    expect(text(tree)).toContain("Current body");
    expect(text(tree)).not.toContain("Stale body");
    const reads = requests("/api/emails/threads/read-state");
    expect(reads).toHaveLength(1);
    expect(JSON.parse(reads[0][1].body)).toEqual({ ids: ["b"], read: true });
    read.resolve(response({ error: "Unread status unavailable" }, 503));
    await settle();
    expect(text(tree)).toContain("Current body");
    expect(elements(tree).some((node) => node.props.title === "Unread Status Unavailable")).toBe(
      true,
    );
    const detailRequestCount = requests("/api/emails/threads/b/outcome").length;
    button("Retry Unread Status").props.onClick?.();
    await settle();
    expect(requests("/api/emails/threads/read-state")).toHaveLength(2);
    expect(JSON.parse(requests("/api/emails/threads/read-state")[1][1].body)).toEqual({
      ids: ["b"],
      read: true,
    });
    expect(requests("/api/emails/threads/b/outcome")).toHaveLength(detailRequestCount);
    expect(text(tree)).toContain("Current body");
    expect(elements(tree).some((node) => node.props.title === "Unread Status Unavailable")).toBe(
      false,
    );
  });
});
