import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  resolveDestination: vi.fn(),
}));

vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("../src/lib/safe-webhook-delivery", () => ({
  resolvePinnedWebhookDestination: mocks.resolveDestination,
}));

import { fetchPublicWebsiteText } from "../src/lib/safe-public-text-fetch";

type ResponseSpec = {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
};

class FakeResponse extends EventEmitter {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  destroyed = false;
  bodyEmitted = false;
  errorListenersAtDestroy = 0;
  readonly destroy = vi.fn((_error?: Error) => {
    this.errorListenersAtDestroy = this.listenerCount("error");
    this.destroyed = true;
  });

  constructor(spec: ResponseSpec) {
    super();
    this.statusCode = spec.statusCode;
    this.headers = spec.headers;
    this.body = spec.body || "";
  }
}

class FakeRequest extends EventEmitter {
  readonly setTimeout = vi.fn();
  readonly destroy = vi.fn((error?: Error) => {
    if (error) queueMicrotask(() => this.emit("error", error));
  });
  readonly end: ReturnType<typeof vi.fn>;

  constructor(callback: (response: FakeResponse) => void, response: FakeResponse) {
    super();
    this.end = vi.fn(() => {
      queueMicrotask(() => {
        callback(response);
        if (response.destroyed) return;
        queueMicrotask(() => {
          if (response.destroyed) return;
          if (response.body) {
            response.bodyEmitted = true;
            response.emit("data", Buffer.from(response.body));
          }
          response.emit("end");
        });
      });
    });
  }
}

let responses: FakeResponse[] = [];

function destination(rawUrl: string) {
  const url = new URL(rawUrl);
  return {
    status: "public" as const,
    url,
    hostname: url.hostname,
    address: "93.184.216.34",
    family: 4 as const,
  };
}

beforeEach(() => {
  responses = [];
  mocks.request.mockReset();
  mocks.resolveDestination.mockReset();
  mocks.request.mockImplementation(
    (_url: URL, _options: unknown, callback: (response: FakeResponse) => void) => {
      const response = responses.shift();
      if (!response) throw new Error("Missing fake HTTPS response");
      return new FakeRequest(callback, response);
    },
  );
});

describe("website fetch response stream safety", () => {
  it("rejects an oversized declared response without emitting an unhandled stream error", async () => {
    const response = new FakeResponse({
      statusCode: 200,
      headers: {
        "content-type": "text/html",
        "content-length": "1000001",
      },
    });
    responses.push(response);
    mocks.resolveDestination.mockResolvedValue(destination("https://example.com/oversized"));

    await expect(fetchPublicWebsiteText("https://example.com/oversized")).rejects.toMatchObject({
      code: "response_too_large",
      httpStatus: 413,
    });

    expect(response.errorListenersAtDestroy).toBe(1);
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.destroy.mock.calls[0]).toHaveLength(0);
    expect(response.bodyEmitted).toBe(false);
  });

  it("closes redirect responses before reading their attacker-controlled body", async () => {
    const redirect = new FakeResponse({
      statusCode: 302,
      headers: {
        location: "/final",
        "content-type": "text/html",
      },
      body: "x".repeat(900_000),
    });
    const final = new FakeResponse({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: "<html><title>Acme</title><body>Acme provides emergency plumbing every day.</body></html>",
    });
    responses.push(redirect, final);
    mocks.resolveDestination
      .mockResolvedValueOnce(destination("https://example.com/start"))
      .mockResolvedValueOnce(destination("https://example.com/final"));

    const result = await fetchPublicWebsiteText("https://example.com/start");

    expect(result.finalUrl).toBe("https://example.com/final");
    expect(result.text).toContain("emergency plumbing");
    expect(redirect.destroy).toHaveBeenCalledTimes(1);
    expect(redirect.destroy.mock.calls[0]).toHaveLength(0);
    expect(redirect.listenerCount("data")).toBe(0);
    expect(redirect.bodyEmitted).toBe(false);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
