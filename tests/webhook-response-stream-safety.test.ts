import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("node:https", () => ({ request: mocks.request }));

import { postWebhookSafely } from "../src/lib/safe-webhook-delivery";

class FakeResponse extends EventEmitter {
  readonly statusCode = 204;
  errorListenersAtDestroy = 0;
  readonly destroy = vi.fn(() => {
    this.errorListenersAtDestroy = this.listenerCount("error");
    queueMicrotask(() => this.emit("error", new Error("socket closed after headers")));
  });
}

class FakeRequest extends EventEmitter {
  readonly setTimeout = vi.fn();
  readonly destroy = vi.fn((error?: Error) => {
    if (error) queueMicrotask(() => this.emit("error", error));
  });
  readonly end: ReturnType<typeof vi.fn>;

  constructor(callback: (response: FakeResponse) => void, response: FakeResponse) {
    super();
    this.end = vi.fn(() => queueMicrotask(() => callback(response)));
  }
}

let response: FakeResponse;

beforeEach(() => {
  response = new FakeResponse();
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    (_url: URL, _options: unknown, callback: (value: FakeResponse) => void) =>
      new FakeRequest(callback, response),
  );
});

describe("outbound webhook response stream safety", () => {
  it("settles from headers, guards the stream, and discards the response body", async () => {
    const result = await postWebhookSafely(
      "https://93.184.216.34/hook",
      { "Content-Type": "application/json" },
      '{"ok":true}',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toEqual({
      status: "sent",
      statusCode: 204,
      ok: true,
      redirect: false,
    });
    expect(response.errorListenersAtDestroy).toBe(1);
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.listenerCount("data")).toBe(0);
  });
});
