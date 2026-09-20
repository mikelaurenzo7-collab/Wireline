import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamingChat } from "../src/hooks/useStreamingChat";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  fetch: vi.fn(),
  refresh: vi.fn(),
  complete: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
vi.mock("../src/lib/api", () => ({
  AUTH_SESSION_EXPIRED_MESSAGE: "Sign in again.",
  refreshSessionIfNeeded: h.refresh,
  isAuthHttpStatus: (status: number) => status === 401 || status === 403,
  parseApiErrorFromText: (text: string) => ({ error: text }),
}));

function StreamingHarness() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return useStreamingChat("/api/agents/bot-1/workspace/messages/stream", {
    onComplete: h.complete,
    onError: h.error,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function liveResponse() {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller;
    },
  });
  return {
    response: new Response(stream),
    send(event: string, data: Record<string, unknown>) {
      source.enqueue(
        new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
    close: () => source.close(),
    fail: () => source.error(new DOMException("Aborted", "AbortError")),
  };
}

async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.fetch.mockReset();
  h.refresh.mockReset().mockResolvedValue(true);
  h.complete.mockReset();
  h.error.mockReset();
  vi.stubGlobal("fetch", h.fetch);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("streaming chat request lifecycle", () => {
  it("keeps a usable terminal reply when its stream disconnects before done", async () => {
    const stream = liveResponse();
    h.fetch.mockResolvedValueOnce(stream.response);
    const turn = StreamingHarness().send({ message: "Prepare a change" });
    await flush();
    const payload = { reply: "Review this change.", changes: [{ field: "tone", value: "warm" }] };
    stream.send("reply", payload);
    await flush();
    stream.fail();
    await turn;

    expect(h.complete).toHaveBeenCalledExactlyOnceWith(payload);
    expect(h.error).not.toHaveBeenCalled();
    expect(StreamingHarness().state.phase).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a handshake timeout for the active request and releases its timers", async () => {
    h.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const turn = StreamingHarness().send({ message: "Hello" });
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await turn;

    expect(h.error).toHaveBeenCalledExactlyOnceWith(
      "Took too long to connect, try again or refresh",
      { streamEstablished: false, partialReply: undefined },
    );
    expect(StreamingHarness().state.phase).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up handshake and idle timers after session rejection", async () => {
    h.refresh.mockResolvedValueOnce(false);

    await StreamingHarness().send({ message: "Hello" });

    expect(h.error).toHaveBeenCalledExactlyOnceWith("Sign in again.", {
      streamEstablished: false,
      partialReply: undefined,
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a cancelled session probe after another turn has started", async () => {
    const oldSession = deferred<boolean>();
    h.refresh.mockReturnValueOnce(oldSession.promise);
    const oldTurn = StreamingHarness().send({ message: "Old turn" });
    const next = liveResponse();
    h.fetch.mockResolvedValueOnce(next.response);
    const nextTurn = StreamingHarness().send({ message: "New turn" });
    await flush();
    next.send("meta", { model: "test-model" });
    await flush();

    oldSession.resolve(false);
    await oldTurn;

    expect(StreamingHarness().state.phase).toBe("thinking");
    expect(h.error).not.toHaveBeenCalled();
    next.send("done", { reply: "Current reply" });
    next.close();
    await nextTurn;
    expect(h.complete).toHaveBeenCalledExactlyOnceWith({ reply: "Current reply" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let an older stream abort settle the current turn", async () => {
    const old = liveResponse();
    const next = liveResponse();
    h.fetch.mockResolvedValueOnce(old.response).mockResolvedValueOnce(next.response);
    const oldTurn = StreamingHarness().send({ message: "Old turn" });
    await flush();
    old.send("meta", { model: "test-model" });
    await flush();
    const nextTurn = StreamingHarness().send({ message: "New turn" });
    await flush();
    next.send("meta", { model: "test-model" });
    await flush();

    old.fail();
    await oldTurn;

    expect(h.error).not.toHaveBeenCalled();
    expect(StreamingHarness().state.phase).toBe("thinking");
    next.send("done", { reply: "Current reply" });
    next.close();
    await nextTurn;
    expect(h.complete).toHaveBeenCalledExactlyOnceWith({ reply: "Current reply" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not fetch or settle after unmount during the session probe", async () => {
    const session = deferred<boolean>();
    h.refresh.mockReturnValueOnce(session.promise);
    const hook = StreamingHarness();
    const cleanup = h.effects[0]();
    const turn = hook.send({ message: "Hello" });

    if (typeof cleanup === "function") cleanup();
    session.resolve(true);
    await turn;

    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
