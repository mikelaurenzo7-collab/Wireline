import { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioWorkroom from "../src/components/StudioWorkroom";

type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void; setter?: unknown };
type Instance = { slots: Slot[]; cursor: number; dirty: boolean; effects: Array<() => void> };
const harness = vi.hoisted(() => ({ current: null as Instance | null, authFetch: vi.fn() }));

// Run the real workroom handlers and SSE hook with deterministic hook lifetimes.
// Only DOM rendering and network transport are replaced; no provider is called.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  const instance = () => {
    if (!harness.current) throw new Error("Hook called outside a mounted test instance");
    return harness.current;
  };
  const unchanged = (a?: unknown[], b?: unknown[]) =>
    Boolean(
      a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])),
    );
  const memoizeHookValue = (factory: () => unknown, deps?: unknown[]) => {
    const owner = instance();
    const slot = (owner.slots[owner.cursor++] ??= {});
    if (!unchanged(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
    }
    return slot.value;
  };
  return {
    ...react,
    useState: (initial: unknown) => {
      const owner = instance();
      const slot = (owner.slots[owner.cursor++] ??= {});
      if (!slot.setter) {
        slot.value = typeof initial === "function" ? initial() : initial;
        slot.setter = (next: unknown) => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(slot.value, value)) owner.dirty = true;
          slot.value = value;
        };
      }
      return [slot.value, slot.setter];
    },
    useRef: (initial: unknown) => {
      const owner = instance();
      const slot = (owner.slots[owner.cursor++] ??= {});
      return (slot.value ??= { current: initial });
    },
    useMemo: memoizeHookValue,
    useCallback: (callback: unknown, deps?: unknown[]) => memoizeHookValue(() => callback, deps),
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const owner = instance();
      const slot = (owner.slots[owner.cursor++] ??= {});
      if (!unchanged(slot.deps, deps)) {
        slot.deps = deps;
        owner.effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect() || undefined;
        });
      }
    },
    useImperativeHandle: () => undefined,
  };
});
vi.mock("../src/lib/api", () => ({
  authFetch: (...args: unknown[]) => harness.authFetch(...args),
  refreshSessionIfNeeded: async () => true,
  AUTH_SESSION_EXPIRED_MESSAGE: "Please sign in again.",
  isAuthHttpStatus: (status: number) => status === 401 || status === 403,
  parseApiErrorFromText: (text: string) => ({ error: text }),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/AgentFace", () => ({ default: "agent-face" }));
vi.mock("../src/components/OutboundDialDialog", () => ({ default: "outbound-dialog" }));

type ElementProps = {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  maxLength?: number;
  message?: { role: string; content: string };
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<ElementProps>;
type Props = React.ComponentProps<typeof StudioWorkroom>;
type Renderable = { render: (props: unknown, ref: null) => ReactNode };
type PendingStream = {
  url: string;
  body: { content: string; history?: Array<{ role: string; content: string }> };
  signal: AbortSignal;
  controller: ReadableStreamDefaultController<Uint8Array>;
  closed: boolean;
};
let streams: PendingStream[];
let unmount: (() => void) | undefined;

function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...descendants(element.props.children)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}
function newInstance(): Instance {
  return { slots: [], cursor: 0, dirty: false, effects: [] };
}
function dispose(instance: Instance) {
  for (const slot of instance.slots) slot.cleanup?.();
}
function invoke(instance: Instance, component: Renderable, props: unknown) {
  instance.cursor = 0;
  instance.dirty = false;
  harness.current = instance;
  try {
    return component.render(props, null);
  } finally {
    harness.current = null;
  }
}
function mount(initial: Partial<Props> = {}) {
  let props: Props = { agentId: "bot-1", agentName: "Sales Bot", mode: "test", ...initial };
  const outer = newInstance();
  let session: Instance | undefined;
  let sessionKey: string | null = null;
  let tree: ReactNode;
  const render = () => {
    for (let pass = 0; pass < 20; pass++) {
      tree = invoke(outer, StudioWorkroom as unknown as Renderable, props);
      const child = tree as ReactElement;
      if (typeof child.type === "object" && child.type && "render" in child.type) {
        if (!session || sessionKey !== child.key) {
          if (session) dispose(session);
          session = newInstance();
          sessionKey = child.key;
        }
        tree = invoke(session, child.type as unknown as Renderable, child.props);
      }
      for (const effect of outer.effects.splice(0)) effect();
      for (const effect of session?.effects.splice(0) || []) effect();
      if (!outer.dirty && !session?.dirty) return;
    }
    throw new Error("Workroom did not settle");
  };
  render();
  unmount = () => {
    dispose(outer);
    if (session) dispose(session);
  };
  const find = (predicate: (element: Element) => boolean) => {
    render();
    const element = descendants(tree).find(predicate);
    if (!element) throw new Error("Expected workroom control was not rendered");
    return element;
  };
  const api = {
    find,
    button: (label: string) =>
      find(
        (e) =>
          e.type === "button" &&
          (e.props["aria-label"] === label || text(e.props.children) === label),
      ),
    composer: () => find((e) => e.type === "textarea"),
    type: (value: string) => api.composer().props.onChange?.({ target: { value } }),
    messages: () => {
      render();
      return descendants(tree).flatMap((e) => (e.props.message ? [e.props.message] : []));
    },
    update: (next: Partial<Props>) => {
      props = { ...props, ...next };
      render();
    },
    flush: async () => {
      for (let turn = 0; turn < 15; turn++) {
        await Promise.resolve();
        render();
      }
    },
  };
  return api;
}
function finish(stream: PendingStream, payload: Record<string, unknown>, event = "done") {
  stream.controller.enqueue(
    new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
  );
  stream.controller.close();
  stream.closed = true;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  streams = [];
  harness.authFetch
    .mockReset()
    .mockImplementation(async () => new Response(JSON.stringify({ messages: [] })));
  vi.stubGlobal("window", { setTimeout, clearTimeout, confirm: vi.fn(() => true) });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, init: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streams.push({
                url,
                body: JSON.parse(String(init.body)),
                signal: init.signal as AbortSignal,
                controller,
                closed: false,
              });
            },
          }),
        ),
    ),
  );
});
afterEach(async () => {
  unmount?.();
  unmount = undefined;
  for (const stream of streams)
    if (!stream.closed) stream.controller.error(new DOMException("Aborted", "AbortError"));
  for (let turn = 0; turn < 15; turn++) await Promise.resolve();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Studio customer rehearsal", () => {
  it("offers the handoff prompt without sending it and bounds test input", () => {
    const ui = mount();
    ui.button("I need to speak with a person.").props.onClick?.();
    expect(ui.composer().props.value).toBe("I need to speak with a person.");
    expect(ui.composer().props.maxLength).toBe(4000);
    expect(streams).toHaveLength(0);
  });

  it("fences same-tick duplicate sends and reset while a reply is pending", async () => {
    const ui = mount();
    ui.type("What do you offer?");
    const send = ui.button("Send").props.onClick!;
    const reset = ui.button("Reset test conversation").props.onClick!;
    send();
    send();
    reset();
    await ui.flush();
    expect(streams).toHaveLength(1);
    expect(ui.messages().map((m) => m.content)).toEqual(["What do you offer?"]);
    expect(ui.button("Reset test conversation").props.disabled).toBe(true);
    finish(streams[0], { reply: "Tell me what you need." });
    await ui.flush();
    ui.button("Reset test conversation").props.onClick?.();
    expect(ui.messages()).toEqual([]);
    expect(harness.authFetch).not.toHaveBeenCalled();
  });

  it("returns a failed test question for editing and omits it from retry history", async () => {
    const ui = mount();
    ui.type("What do you offer?");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    finish(streams[0], { reply: "We help with bookkeeping." });
    await ui.flush();
    ui.type("Can you explain the price?");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    finish(streams[1], { message: "Please try again shortly." }, "error");
    await ui.flush();
    expect(ui.composer().props.value).toBe("Can you explain the price?");
    expect(ui.messages()).toHaveLength(2);
    ui.type("What is included?");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    expect(streams).toHaveLength(3);
    expect(streams[2].body).toEqual({
      content: "What is included?",
      history: [
        { role: "customer", content: "What do you offer?" },
        { role: "employee", content: "We help with bookkeeping." },
      ],
    });
  });

  it("aborts the previous mode and keeps its late reply out of Build", async () => {
    harness.authFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "saved",
              role: "agent",
              content: "Saved Build conversation",
              createdAt: "2026-09-14",
            },
          ],
        }),
      ),
    );
    const ui = mount();
    ui.type("Customer-only question");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    const old = streams[0];
    ui.update({ mode: "configure" });
    await ui.flush();
    expect(old.signal.aborted).toBe(true);
    expect(ui.messages().map((m) => m.content)).toEqual(["Saved Build conversation"]);
    finish(old, { reply: "Late customer reply" });
    await ui.flush();
    expect(ui.messages().map((m) => m.content)).toEqual(["Saved Build conversation"]);
    ui.type("Use a warmer greeting");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    expect(streams[1].url).toBe("/api/agents/bot-1/workspace/messages/stream");
    expect(streams[1].body).toEqual({ content: "Use a warmer greeting" });
  });

  it("preserves separate unsent drafts across modes and scopes them to one Bot", async () => {
    const ui = mount();
    ui.type("My customer question");
    ui.update({ mode: "configure" });
    await ui.flush();
    expect(ui.composer().props.value).toBe("");
    ui.type("My Build instruction");
    ui.update({ mode: "test" });
    expect(ui.composer().props.value).toBe("My customer question");
    ui.update({ mode: "configure" });
    await ui.flush();
    expect(ui.composer().props.value).toBe("My Build instruction");
    ui.update({ agentId: "bot-2", mode: "test" });
    expect(ui.composer().props.value).toBe("");
  });

  it("clears only an untouched route question when its command is removed", async () => {
    const ui = mount({ initialCommand: "Injected question" });
    expect(ui.composer().props.value).toBe("Injected question");
    ui.update({ mode: "configure", initialCommand: undefined });
    await ui.flush();
    ui.type("Keep this Build draft");
    ui.update({ mode: "test" });
    expect(ui.composer().props.value).toBe("");
    ui.update({ initialCommand: "Another question", commandNonce: "2" });
    ui.type("My edited question");
    ui.update({ mode: "configure", initialCommand: undefined });
    await ui.flush();
    expect(ui.composer().props.value).toBe("Keep this Build draft");
    ui.update({ mode: "test" });
    expect(ui.composer().props.value).toBe("My edited question");
  });

  it("blocks sends before history loads and while a single clear is pending", async () => {
    const load = deferred<Response>();
    const clear = deferred<Response>();
    harness.authFetch.mockReturnValueOnce(load.promise).mockReturnValueOnce(clear.promise);
    const ui = mount({ mode: "configure" });
    ui.type("Build draft");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    expect(streams).toHaveLength(0);
    load.resolve(
      new Response(
        JSON.stringify({
          messages: [
            { id: "saved", role: "agent", content: "Saved advice", createdAt: "2026-09-14" },
          ],
        }),
      ),
    );
    await ui.flush();
    const reset = ui.button("Clear conversation").props.onClick!;
    const send = ui.button("Send").props.onClick!;
    reset();
    reset();
    send();
    await ui.flush();
    expect(harness.authFetch).toHaveBeenCalledTimes(2);
    expect(streams).toHaveLength(0);
    clear.resolve(new Response("", { status: 500 }));
    await ui.flush();
    expect(ui.messages().map((m) => m.content)).toEqual(["Saved advice"]);
    expect(ui.composer().props.value).toBe("Build draft");
    expect(ui.button("Send").props.disabled).toBe(false);
  });

  it("keeps an oversized injected question editable without sending an invalid request", async () => {
    const ui = mount({ initialCommand: "x".repeat(4001) });
    ui.button("Send").props.onClick?.();
    await ui.flush();
    expect(streams).toHaveLength(0);
    expect(ui.composer().props.value).toHaveLength(4001);
    ui.type("A shorter question");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    expect(streams).toHaveLength(1);
  });

  it("does not restore or automatically replay a failed Build command", async () => {
    const ui = mount({ mode: "configure" });
    await ui.flush();
    ui.type("Update my greeting");
    ui.button("Send").props.onClick?.();
    await ui.flush();
    finish(streams[0], { message: "Connection failed." }, "error");
    await ui.flush();
    expect(ui.composer().props.value).toBe("");
    expect(ui.messages().map((m) => m.content)).toEqual(["Update my greeting"]);
    expect(streams).toHaveLength(1);
  });
});
