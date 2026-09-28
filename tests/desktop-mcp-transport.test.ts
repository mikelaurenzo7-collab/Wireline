import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ request: vi.fn(), resolve: vi.fn() }));
vi.mock("node:https", () => ({ request: network.request }));
vi.mock("../src/lib/safe-webhook-delivery", () => ({
  resolvePinnedWebhookDestination: network.resolve,
}));
import {
  createRpcEventMatcher,
  createSseParser,
  isEventStreamContentType,
  parseCompleteSseData,
  postPinned,
} from "../apps/desktop/src/transport";

function connection(contentType = "Text/Event-Stream; charset=utf-8", contentEncoding?: string) {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {
      "content-type": contentType,
      ...(contentEncoding ? { "content-encoding": contentEncoding } : {}),
    },
    destroy: vi.fn((error?: Error) => {
      if (error) response.emit("error", error);
    }),
  });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  network.request.mockImplementation((_url, options, callback) => {
    const request = Object.assign(new EventEmitter(), {
      end: vi.fn(() => {
        callback(response);
        ready();
      }),
    });
    options.signal.addEventListener("abort", () => request.emit("error", options.signal.reason), {
      once: true,
    });
    return request;
  });
  return { response, started };
}

beforeEach(() => {
  network.request.mockReset();
  network.resolve.mockReset().mockResolvedValue({
    status: "public",
    url: new URL("https://tools.example.test/mcp"),
    address: "203.0.113.10",
    family: 4,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("bounded incremental MCP transport", () => {
  it("recognizes case-insensitive media types without accepting substring lookalikes", () => {
    expect(isEventStreamContentType(" Text/Event-Stream ; charset=UTF-8")).toBe(true);
    expect(isEventStreamContentType("application/json; note=text/event-stream")).toBe(false);
    expect(isEventStreamContentType("text/event-stream-extra")).toBe(false);
  });

  it("preserves split UTF8, CRLF boundaries, multiline data and ignores incomplete events", () => {
    const events: string[] = [];
    const parser = createSseParser((data) => {
      events.push(data);
    });
    const body = '\uFEFF: heartbeat\r\ndata: {\r\ndata: "text":"café ✅"}\r\n\r\ndata: partial';
    for (const byte of Buffer.from(body)) parser.push(Buffer.from([byte]));
    expect(events).toEqual(['{\n"text":"café ✅"}']);
    expect(parseCompleteSseData(body)).toEqual(events);
  });

  it.each(["\n", "\r", "\r\n"])(
    "only completes a matching fully delimited RPC event with %j lines",
    (newline) => {
      const matcher = createRpcEventMatcher("wanted");
      expect(
        matcher.push(
          Buffer.from(`data: {"jsonrpc":"2.0","id":"other","result":{}}${newline}${newline}`),
        ),
      ).toBe(false);
      expect(
        matcher.push(Buffer.from(`data: {"jsonrpc":"2.0","method":"notice"}${newline}${newline}`)),
      ).toBe(false);
      expect(matcher.push(Buffer.from('data: {"jsonrpc":"2.0","id":"wanted","result":{}}'))).toBe(
        false,
      );
      expect(matcher.push(Buffer.from(newline))).toBe(false);
      expect(matcher.push(Buffer.from(newline))).toBe(true);
    },
  );

  it("bounds an unterminated stream before it can accumulate over one MiB", () => {
    const matcher = createRpcEventMatcher("wanted");
    expect(matcher.push(Buffer.alloc(1024 * 1024, 97))).toBe(false);
    expect(() => matcher.push(Buffer.from("a"))).toThrow(/too large/);
  });

  it("finishes a mixed-case open SSE stream with one final concatenation, never one per tiny chunk", async () => {
    const { response, started } = connection(undefined, " Identity ");
    const pending = postPinned("https://tools.example.test/mcp", '{"id":"wanted"}', {});
    await started;
    const concat = vi.spyOn(Buffer, "concat");
    const event = `data: ${JSON.stringify({ jsonrpc: "2.0", id: "wanted", result: { text: "é✅" + "x".repeat(16_384) } })}`;
    for (const byte of Buffer.from(event)) response.emit("data", Buffer.from([byte]));
    expect(concat).not.toHaveBeenCalled();
    expect(response.destroy).not.toHaveBeenCalled();
    response.emit("data", Buffer.from("\r"));
    response.emit("data", Buffer.from("\n"));
    expect(response.destroy).not.toHaveBeenCalled();
    response.emit("data", Buffer.from("\r"));
    const reply = await pending;
    expect(reply.body).toBe(`${event}\r\n\r`);
    expect(concat).toHaveBeenCalledTimes(1);
    expect(response.destroy).toHaveBeenCalledTimes(1);
    response.emit("end");
    expect(concat).toHaveBeenCalledTimes(1);
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it("does not finish an unrelated or partial event and remains abortable without replay", async () => {
    const { response, started } = connection();
    const controller = new AbortController();
    const pending = postPinned(
      "https://tools.example.test/mcp",
      '{"id":"wanted"}',
      {},
      controller.signal,
    );
    const rejected = expect(pending).rejects.toThrow("Owner stopped");
    await started;
    response.emit("data", Buffer.from('data: {"jsonrpc":"2.0","id":"other","result":{}}\n\n'));
    response.emit("data", Buffer.from('data: {"jsonrpc":"2.0","id":"wanted","result":{}}'));
    expect(response.destroy).not.toHaveBeenCalled();
    controller.abort(new Error("Owner stopped"));
    await rejected;
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized response before completion without a second POST", async () => {
    const { response, started } = connection();
    const pending = postPinned("https://tools.example.test/mcp", '{"id":"wanted"}', {});
    const rejected = expect(pending).rejects.toThrow(/too large/);
    await started;
    response.emit("data", Buffer.alloc(1024 * 1024 + 1, 97));
    await rejected;
    expect(network.request).toHaveBeenCalledTimes(1);
  });
});
