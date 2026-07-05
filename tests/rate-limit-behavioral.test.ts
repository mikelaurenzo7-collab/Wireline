import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  rateLimit,
  isRedisConfigured,
  distributedLimiterStatus,
  startMemoryCleanup,
} from "../src/lib/rate-limit";

describe("rateLimit (in-memory fallback)", () => {
  it("allows first request within window", async () => {
    const result = await rateLimit("test-key", { bucket: "test", windowMs: 60_000, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it("allows up to max requests", async () => {
    const key = "key-" + Math.random();
    const opts = { bucket: "test", windowMs: 60_000, max: 3 };
    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(key, opts);
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects requests beyond max", async () => {
    const key = "key-" + Math.random();
    const opts = { bucket: "test", windowMs: 60_000, max: 2 };
    await rateLimit(key, opts);
    await rateLimit(key, opts);
    const blocked = await rateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("returns correct remaining count", async () => {
    const key = "key-" + Math.random();
    const opts = { bucket: "test", windowMs: 60_000, max: 5 };
    await rateLimit(key, opts);
    const r2 = await rateLimit(key, opts);
    expect(r2.remaining).toBe(3);
    const r3 = await rateLimit(key, opts);
    expect(r3.remaining).toBe(2);
  });

  it("scopes by bucket name", async () => {
    const key = "same-key";
    const r1 = await rateLimit(key, { bucket: "bucket-a", windowMs: 60_000, max: 2 });
    const r2 = await rateLimit(key, { bucket: "bucket-b", windowMs: 60_000, max: 2 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(r2.remaining).toBe(1);
  });

  it("scopes by key within same bucket", async () => {
    const r1 = await rateLimit("key-a", { bucket: "test", windowMs: 60_000, max: 1 });
    const r2 = await rateLimit("key-b", { bucket: "test", windowMs: 60_000, max: 1 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});

describe("isRedisConfigured", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns false when not configured", () => {
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns false when only url is set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns false when only token is set", () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns true when both url and token are set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
    expect(isRedisConfigured()).toBe(true);
  });
});

describe("distributedLimiterStatus", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT;
    delete process.env.VERCEL;
    delete process.env.NODE_ENV;
  });

  it("returns ok when Redis is configured", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("returns ok when in-memory fallback is explicitly allowed", () => {
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("returns ok in non-production environment without Redis", () => {
    process.env.NODE_ENV = "development";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("returns not ok in production without Redis or fallback", () => {
    process.env.NODE_ENV = "production";
    const status = distributedLimiterStatus();
    expect(status.ok).toBe(false);
    expect(status.code).toBe("RATE_LIMITER_UNAVAILABLE");
    expect(status.reason).toBeTruthy();
  });

  it("returns not ok in Vercel without Redis or fallback", () => {
    process.env.VERCEL = "1";
    const status = distributedLimiterStatus();
    expect(status.ok).toBe(false);
    expect(status.code).toBe("RATE_LIMITER_UNAVAILABLE");
  });
});

describe("startMemoryCleanup", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns a timer id", () => {
    const id = startMemoryCleanup(1000);
    expect(id).toBeDefined();
    clearInterval(id);
  });

  it("cleans up expired buckets", async () => {
    const id = startMemoryCleanup(100);
    const key = "cleanup-" + Math.random();
    await rateLimit(key, { bucket: "test", windowMs: 1, max: 5 });
    await new Promise((r) => setTimeout(r, 200));
    const result = await rateLimit(key, { bucket: "test", windowMs: 60_000, max: 5 });
    expect(result.remaining).toBe(4);
    clearInterval(id);
  });
});
