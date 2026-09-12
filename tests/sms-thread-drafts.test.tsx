import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmsThreads from "../src/components/SmsThreads";

const harness = vi.hoisted(() => ({
  slots: [] as Array<{
    value?: unknown;
    dependencies?: readonly unknown[];
    cleanup?: () => void;
  }>,
  cursor: 0,
  dirty: false,
  layoutEffects: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  authFetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

// Invoke the actual component's handlers with persistent hook state, dependency
// changes, and effect cleanup, following the repository's node-only UI harness.
vi.mock("react", async (importOriginal) => {
  const changed = (previous: readonly unknown[] | undefined, next?: readonly unknown[]) =>
    !previous ||
    !next ||
    previous.length !== next.length ||
    next.some((value, index) => !Object.is(value, previous[index]));
  const memo = (factory: () => unknown, dependencies?: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index];
    if (!previous || changed(previous.dependencies, dependencies)) {
      harness.slots[index] = { value: factory(), dependencies };
    }
    return harness.slots[index].value;
  };
  const effect = (
    callback: () => void | (() => void),
    dependencies: readonly unknown[] | undefined,
    queue: Array<() => void>,
  ) => {
    const index = harness.cursor++;
    const slot = harness.slots[index] ?? {};
    if (changed(slot.dependencies, dependencies)) {
      slot.dependencies = dependencies;
      queue.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
    harness.slots[index] = slot;
  };
  return {
    ...(await importOriginal<typeof import("react")>()),
    useState(initial: unknown) {
      const index = harness.cursor++;
      if (!(index in harness.slots)) {
        harness.slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      }
      return [
        harness.slots[index].value,
        (next: unknown) => {
          const value = typeof next === "function" ? next(harness.slots[index].value) : next;
          if (!Object.is(value, harness.slots[index].value)) {
            harness.slots[index].value = value;
            harness.dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const index = harness.cursor++;
      harness.slots[index] ??= { value: { current: initial } };
      return harness.slots[index].value;
    },
    useMemo: memo,
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      memo(() => callback, dependencies),
    useEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, harness.effects),
    useLayoutEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, harness.layoutEffects),
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: harness.authFetch }));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: harness.success, error: harness.error }),
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  EmptyState: "empty-state",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({
  ConversationMessage: "conversation-message",
  SearchField: "search-field",
  StatusNotice: "status-notice",
}));
vi.mock("../src/components/SmsOutcomePanel", () => ({ default: "sms-outcome" }));

type Props = {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};
type Element = ReactElement<Props>;
const threads = [
  {
    id: "thread-a",
    customer_number: "+13125550101",
    destination_number: "+13125550100",
    status: "open",
  },
  {
    id: "thread-b",
    customer_number: "+13125550102",
    destination_number: "+13125550100",
    status: "open",
  },
];
let tree: ReactNode;
let agentId: string | null;
let replyResponses: Array<() => Promise<Response>>;
let draftResponse: Record<string, unknown>;
const stored = new Map<string, string>();

function response(body: Record<string, unknown>, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("SMS test render did not settle");
    harness.dirty = false;
    harness.cursor = 0;
    harness.layoutEffects = [];
    harness.effects = [];
    tree = SmsThreads({ embedded: true, agentId });
    harness.layoutEffects.forEach((run) => run());
    harness.effects.forEach((run) => run());
  } while (harness.dirty);
}

async function settle() {
  render();
  for (let pass = 0; pass < 16; pass += 1) {
    await Promise.resolve();
    if (harness.dirty) render();
  }
}

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child));
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join("");
  if (isValidElement<Props>(node)) return content(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function find(predicate: (element: Element) => boolean): Element {
  const element = elements(tree).find(predicate);
  if (!element) throw new Error("Expected SMS control was not rendered");
  return element;
}

function labeled(label: string): Element {
  return find((element) => element.props["aria-label"] === label);
}

async function selectThread(index: number) {
  find(
    (element) =>
      element.type === "button" &&
      content(element.props.children).includes(threads[index].customer_number),
  ).props.onClick?.();
  await settle();
}

async function backToList() {
  find(
    (element) => element.type === "button" && content(element.props.children) === "Texts",
  ).props.onClick?.();
  await settle();
}

async function typeReply(value: string) {
  labeled("Text reply").props.onChange?.({ target: { value } });
  await settle();
}

function submit() {
  find((element) => element.type === "form").props.onSubmit?.({ preventDefault: vi.fn() });
}

function sendRequests() {
  return harness.authFetch.mock.calls.filter(([url]) => String(url).endsWith("/reply"));
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.dirty = false;
  vi.clearAllMocks();
  agentId = null;
  replyResponses = [];
  draftResponse = { reply: "A suggested reply", requires_human: false };
  stored.clear();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
  harness.authFetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/reply")) {
      const next = replyResponses.shift();
      if (!next) throw new Error("Unexpected SMS send without a mocked response");
      return next();
    }
    if (url.endsWith("/draft")) return response(draftResponse);
    if (url.endsWith("/messages")) return response({ messages: [] });
    if (url.endsWith("/mark-read")) return response({ ok: true });
    if (url.startsWith("/api/sms/threads")) return response({ threads });
    throw new Error(`Unexpected mocked endpoint: ${url}`);
  });
});

afterEach(() => {
  harness.slots.forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
});

describe("SMS conversation drafts", () => {
  it("keeps manual replies when returning to the list and isolates different conversations", async () => {
    await settle();
    await selectThread(0);
    await typeReply("First customer's draft");
    await backToList();
    await selectThread(1);
    expect(labeled("Text reply").props.value).toBe("");
    await typeReply("Second customer's draft");
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("First customer's draft");
    await selectThread(1);
    expect(labeled("Text reply").props.value).toBe("Second customer's draft");
    expect(sendRequests()).toHaveLength(0);
  });

  it("restores Bot-written replies with their human-review notice, including after rejection", async () => {
    draftResponse = {
      reply: "I can help with that request.",
      requires_human: true,
      reason: "Confirm the customer's appointment before sending.",
    };
    await settle();
    await selectThread(0);
    labeled("Write reply with Bot").props.onClick?.();
    await settle();
    await backToList();
    await selectThread(1);
    expect(content(tree)).not.toContain(draftResponse.reason);
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe(draftResponse.reply);
    expect(content(tree)).toContain(draftResponse.reason);
    expect(sendRequests()).toHaveLength(0);
    replyResponses.push(async () => response({ ok: false, reason: "Line unavailable" }, 422));
    submit();
    await settle();
    await backToList();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe(draftResponse.reply);
    expect(content(tree)).toContain(draftResponse.reason);
    expect(sendRequests()).toHaveLength(1);
  });

  it("clears drafts when the Bot filter changes", async () => {
    await settle();
    await selectThread(0);
    await typeReply("Draft under the previous Bot filter");
    agentId = "bot-b";
    await settle();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("");
    agentId = null;
    await settle();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("");
    expect(sendRequests()).toHaveLength(0);
  });

  it("shows the locked draft during sending and clears it only after acceptance", async () => {
    const pending = deferredResponse();
    replyResponses.push(() => pending.promise);
    await settle();
    await selectThread(0);
    await typeReply("Please confirm my appointment.");
    submit();
    await settle();
    expect(labeled("Text reply").props.value).toBe("Please confirm my appointment.");
    expect(labeled("Text reply").props.disabled).toBe(true);
    expect(labeled("Send text").props.disabled).toBe(true);
    pending.resolve(response({ ok: true }));
    await settle();
    expect(labeled("Text reply").props.value).toBe("");
    await backToList();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("");
    expect(sendRequests()).toHaveLength(1);
  });

  it("retains rejected or interrupted replies and reuses the interrupted send's operation on retry", async () => {
    replyResponses.push(
      async () => response({ ok: false, reason: "The sending line needs review." }, 422),
      async () => {
        throw new Error("Connection interrupted");
      },
      async () => response({ ok: true }),
    );
    await settle();
    await selectThread(0);
    await typeReply("Keep this exact reply.");
    submit();
    await settle();
    expect(labeled("Text reply").props.value).toBe("Keep this exact reply.");
    expect(labeled("Text reply").props.disabled).toBe(false);
    await backToList();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("Keep this exact reply.");
    submit();
    await settle();
    expect(labeled("Text reply").props.value).toBe("Keep this exact reply.");
    expect(elements(tree).some((element) => element.props.title === "Safe retry pending")).toBe(
      true,
    );
    await backToList();
    await selectThread(0);
    submit();
    await settle();
    const requests = sendRequests();
    expect(requests).toHaveLength(3);
    expect(requests[2][1].headers["Idempotency-Key"]).toBe(
      requests[1][1].headers["Idempotency-Key"],
    );
    expect(requests.map(([, options]) => JSON.parse(options.body).body)).toEqual(
      Array(3).fill("Keep this exact reply."),
    );
    expect(labeled("Text reply").props.value).toBe("");
  });

  it("preserves an ambiguous draft while continuing to block duplicate sending", async () => {
    replyResponses.push(async () =>
      response(
        {
          ok: false,
          code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
          provider_outcome_ambiguous: true,
          do_not_resend: true,
        },
        503,
      ),
    );
    await settle();
    await selectThread(0);
    await typeReply("Do not send this twice.");
    submit();
    await settle();
    await backToList();
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("Do not send this twice.");
    expect(labeled("Text reply").props.disabled).toBe(true);
    expect(labeled("Send text").props.disabled).toBe(true);
    expect(labeled("Write reply with Bot").props.disabled).toBe(true);
    submit();
    await settle();
    expect(sendRequests()).toHaveLength(1);
    expect(
      elements(tree).some((element) => element.props.title === "Delivery status unknown"),
    ).toBe(true);
  });

  it("clears only the accepted conversation when its reply finishes after switching threads", async () => {
    const pending = deferredResponse();
    replyResponses.push(() => pending.promise);
    await settle();
    await selectThread(0);
    await typeReply("The first customer's outgoing reply.");
    submit();
    await settle();
    await selectThread(1);
    await typeReply("The second customer's unfinished reply.");
    pending.resolve(response({ ok: true }));
    await settle();
    expect(labeled("Text reply").props.value).toBe("The second customer's unfinished reply.");
    expect(labeled("Text reply").props.disabled).toBe(false);
    await selectThread(0);
    expect(labeled("Text reply").props.value).toBe("");
    await selectThread(1);
    expect(labeled("Text reply").props.value).toBe("The second customer's unfinished reply.");
    expect(sendRequests()).toHaveLength(1);
  });
});
