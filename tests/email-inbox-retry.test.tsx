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
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let agentId: string | null;
let listResponses: Array<() => Promise<Response>>;
let syncResponses: Array<() => Promise<Response>>;
let detailResponses: Array<() => Promise<Response>>;
let readResponses: Array<() => Promise<Response>>;
let threads: Array<Record<string, unknown>>;
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
    tree = EmailInbox({ embedded: true, agentId });
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
  threads = [];
  listResponses = [];
  syncResponses = [];
  detailResponses = [];
  readResponses = [];
  h.fetch.mockImplementation(async (url: string) => {
    if (url === "/api/emails/accounts") return response({ accounts: [{ id: "mailbox" }] });
    if (url === "/api/emails/sync") {
      const next = syncResponses.shift();
      if (!next) throw new Error("Unexpected mailbox sync");
      return next();
    }
    if (url === "/api/emails/threads/read-state")
      return readResponses.shift()?.() ?? response({ success: true });
    if (/\/api\/emails\/threads\/[^/]+\/outcome$/.test(url))
      return detailResponses.shift()?.() ?? response({ thread: threads[0], messages: [] });
    if (url.startsWith("/api/emails/threads"))
      return listResponses.shift()?.() ?? response({ threads });
    throw new Error(`Unexpected endpoint ${url}`);
  });
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("email inbox operation recovery", () => {
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
    expect(latest.searchParams.get("offset")).toBe("0");
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

  it("loads older conversations and scopes search to the emails loaded so far", async () => {
    listResponses = [
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "first", subject: "Latest" }],
            hasMore: true,
            nextOffset: 100,
          }),
        ),
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "older", subject: "Old appointment" }],
            hasMore: false,
            nextOffset: 101,
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
    expect(latest.searchParams.get("offset")).toBe("100");
    expect(
      elements(tree).some((node) => node.type === "button" && text(node) === "Load More Email"),
    ).toBe(false);
  });

  it("preserves loaded conversations and retries the failed older page", async () => {
    listResponses = [
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "first", subject: "Latest" }],
            hasMore: true,
            nextOffset: 100,
          }),
        ),
      () => Promise.resolve(response({ error: "Older mail unavailable" }, 503)),
      () =>
        Promise.resolve(
          response({
            threads: [{ id: "older", subject: "Older" }],
            hasMore: false,
            nextOffset: 101,
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
            nextOffset: 100,
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
