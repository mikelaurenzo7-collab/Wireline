import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  auditLogger: {
    logSecurity: vi.fn().mockResolvedValue(undefined),
  },
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { oauthRateLimiter } from "../src/middleware/rate-limit-middleware";

type MockResponse = {
  body?: unknown;
  headers: Record<string, string>;
  locals: Record<string, unknown>;
  statusCode?: number;
  json: (body: unknown) => MockResponse;
  setHeader: (name: string, value: string | number) => void;
  status: (statusCode: number) => MockResponse;
};

type LimiterResult = {
  kind: "next" | "response";
  response: MockResponse;
};

const originalNodeEnv = process.env.NODE_ENV;
const originalPlaywright = process.env.PLAYWRIGHT_TEST;
const originalVercel = process.env.VERCEL;
const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const originalMemoryOptIn = process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT;

function createResponse(resolve: (result: LimiterResult) => void): MockResponse {
  const response: MockResponse = {
    headers: {},
    locals: {},
    json(body) {
      response.body = body;
      resolve({ kind: "response", response });
      return response;
    },
    setHeader(name, value) {
      response.headers[name.toLowerCase()] = String(value);
    },
    status(statusCode) {
      response.statusCode = statusCode;
      return response;
    },
  };
  return response;
}

function invokeLimiter(ip: string, existingResponse?: MockResponse): Promise<LimiterResult> {
  return new Promise((resolve) => {
    const response = existingResponse ?? createResponse(resolve);
    if (existingResponse) {
      response.json = (body) => {
        response.body = body;
        resolve({ kind: "response", response });
        return response;
      };
    }
    oauthRateLimiter({ ip }, response, () => resolve({ kind: "next", response }));
  });
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.NODE_ENV = "development";
  delete process.env.PLAYWRIGHT_TEST;
  delete process.env.VERCEL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT;
});

afterEach(() => {
  restore("NODE_ENV", originalNodeEnv);
  restore("PLAYWRIGHT_TEST", originalPlaywright);
  restore("VERCEL", originalVercel);
  restore("UPSTASH_REDIS_REST_URL", originalRedisUrl);
  restore("UPSTASH_REDIS_REST_TOKEN", originalRedisToken);
  restore("WIRELINE_ALLOW_INMEMORY_RATE_LIMIT", originalMemoryOptIn);
});

describe("OAuth rate-limit middleware", () => {
  it("charges one quota unit when the same response crosses preflight and canonical middleware", async () => {
    const ip = `oauth-single-check-${Math.random()}`;
    const first = await invokeLimiter(ip);
    expect(first.kind).toBe("next");
    expect(first.response.locals.oauthRateLimitChecked).toBe(true);

    const canonicalPass = await invokeLimiter(ip, first.response);
    expect(canonicalPass.kind).toBe("next");

    // The first pass plus nine distinct responses reaches the configured max of ten.
    for (let index = 0; index < 9; index += 1) {
      expect((await invokeLimiter(ip)).kind).toBe("next");
    }

    const blocked = await invokeLimiter(ip);
    expect(blocked.kind).toBe("response");
    expect(blocked.response.statusCode).toBe(429);
    expect(blocked.response.headers["retry-after"]).toBe("300");
    expect(blocked.response.body).toMatchObject({ code: "OAUTH_RATE_LIMIT" });
  });

  it("fails closed in production when distributed rate limiting is unavailable", async () => {
    process.env.NODE_ENV = "production";
    const result = await invokeLimiter(`oauth-no-redis-${Math.random()}`);

    expect(result.kind).toBe("response");
    expect(result.response.statusCode).toBe(503);
    expect(result.response.body).toMatchObject({ code: "RATE_LIMITER_UNAVAILABLE" });
    expect(result.response.locals.oauthRateLimitChecked).not.toBe(true);
  });
});
