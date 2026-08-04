import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  openaiProbe: vi.fn(),
  vapiProbe: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class RedisMock {
    get = mocks.get;
    set = mocks.set;
  },
}));

vi.mock("../src/lib/public-health-probe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/public-health-probe")>();
  return {
    ...actual,
    probeOpenAIModel: mocks.openaiProbe,
    probeVapiManagedVoice: mocks.vapiProbe,
  };
});

vi.mock("../src/lib/ai-models", () => ({
  OPENAI_STRUCTURED_PRIMARY_MODEL: "reasoning-model",
}));

class MockResponse {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
    return this;
  }

  end(chunk?: unknown): this {
    this.body = chunk == null ? "" : String(chunk);
    return this;
  }
}

function request(method = "GET"): IncomingMessage {
  return { method, headers: {} } as IncomingMessage;
}

async function loadHandler() {
  const module = await import("../src/entrypoints/public-health-api");
  return module.default;
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.openaiProbe.mockReset();
  mocks.vapiProbe.mockReset();
  process.env = {
    ...originalEnv,
    OPENAI_API_KEY: "test-openai-key",
    VAPI_PRIVATE_KEY: "test-vapi-key",
    UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
    UPSTASH_REDIS_REST_URL: "https://test-upstash.example.com",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_SHA: "ABCDEF1234567890",
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.useRealTimers();
});

// Executed in every Vercel build; the certification commit also runs the full
// TypeScript, ESLint, and non-E2E suite against this exact implementation.
describe("public health Vercel function", () => {
  it("fails closed without Redis and never calls an external provider", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const handler = await loadHandler();
    const res = new MockResponse();

    await handler(request(), res as unknown as ServerResponse);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({ code: "DISTRIBUTED_CACHE_REQUIRED" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.openaiProbe).not.toHaveBeenCalled();
    expect(mocks.vapiProbe).not.toHaveBeenCalled();
  });

  it("serves a production-scoped Redis result without probing providers", async () => {
    process.env.VERCEL_ENV = "production";
    const cached = {
      overall: "operational",
      components: {
        voice_runtime: "operational",
        voice_fallback: "operational",
        reasoning: "operational",
      },
      last_checked: "2026-08-04T00:00:00.000Z",
    };
    mocks.get.mockResolvedValue(cached);
    const handler = await loadHandler();
    const res = new MockResponse();

    await handler(request(), res as unknown as ServerResponse);

    expect(mocks.get).toHaveBeenCalledWith("wireline:health:public:v4:production");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.openaiProbe).not.toHaveBeenCalled();
    expect(mocks.vapiProbe).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers.get("x-wireline-health-source")).toBe("redis");
    expect(JSON.parse(res.body)).toEqual(cached);
  });

  it("lets one preview-scoped lock owner probe each owning provider and cache the result", async () => {
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValueOnce("OK").mockResolvedValueOnce("OK");
    mocks.vapiProbe.mockResolvedValue({
      ok: true,
      latency_ms: 5,
      model: "vapi-managed-voice",
    });
    mocks.openaiProbe.mockImplementation(async (model: string) => ({
      ok: true,
      latency_ms: 5,
      model,
    }));
    const handler = await loadHandler();
    const res = new MockResponse();

    await handler(request(), res as unknown as ServerResponse);

    const scope = "preview:abcdef1234567890";
    expect(mocks.set).toHaveBeenNthCalledWith(
      1,
      `wireline:health:public:probe-lock:v4:${scope}`,
      expect.any(Number),
      { nx: true, ex: 12 },
    );
    expect(mocks.vapiProbe).toHaveBeenCalledTimes(1);
    expect(mocks.vapiProbe).toHaveBeenCalledWith("test-vapi-key");
    expect(mocks.openaiProbe).toHaveBeenCalledTimes(1);
    expect(mocks.openaiProbe).toHaveBeenCalledWith("reasoning-model", "test-openai-key");
    expect(mocks.set).toHaveBeenNthCalledWith(
      2,
      `wireline:health:public:v4:${scope}`,
      expect.objectContaining({
        overall: "operational",
        components: {
          voice_runtime: "operational",
          voice_fallback: "operational",
          reasoning: "operational",
        },
      }),
      { ex: 120 },
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    expect(res.headers.get("x-wireline-health-source")).toBe("probe");
  });

  it("rejects unsupported methods without touching Redis", async () => {
    const handler = await loadHandler();
    const res = new MockResponse();

    await handler(request("POST"), res as unknown as ServerResponse);

    expect(res.statusCode).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
