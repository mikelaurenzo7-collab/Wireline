// Rate limiter tests — both Redis path (mocked) and in-memory fallback.
// Production scaling depends on this being airtight: a regression here
// either lets DOS traffic through or locks out paying users.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks — vi.mock is moved above imports, so the factory cannot
// see outer-scope variables unless they are defined via vi.hoisted().
const { mockIncr, mockPexpire } = vi.hoisted(() => ({
  mockIncr: vi.fn(),
  mockPexpire: vi.fn(),
}));

vi.mock("@upstash/redis", () => {
  // Use a class so `new Redis(...)` works (vi.fn() return values are not constructable).
  class Redis {
    incr = mockIncr;
    pexpire = mockPexpire;
    constructor(_opts: unknown) {}
  }
  return { Redis };
});

describe("rate-limit (in-memory fallback)", () => {
  beforeEach(() => {
    // Ensure no Redis env vars so module uses memory fallback.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    mockIncr.mockReset();
    mockPexpire.mockReset();
  });

  it("allows the first request and decrements remaining", async () => {
    const { rateLimit } = await import("./rate-limit");
    const result = await rateLimit("user-1", { bucket: "test", windowMs: 1000, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetMs).toBeGreaterThan(0);
    expect(result.resetMs).toBeLessThanOrEqual(1000);
  });

  it("rejects when count exceeds max in the same window", async () => {
    const { rateLimit } = await import("./rate-limit");
    const opts = { bucket: "test-reject", windowMs: 60_000, max: 3 };
    const r1 = await rateLimit("user-1", opts);
    const r2 = await rateLimit("user-1", opts);
    const r3 = await rateLimit("user-1", opts);
    const r4 = await rateLimit("user-1", opts);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("isolates buckets so a key in 'claude' doesn't drain 'email'", async () => {
    const { rateLimit } = await import("./rate-limit");
    const claude = { bucket: "claude", windowMs: 60_000, max: 1 };
    const email = { bucket: "email", windowMs: 60_000, max: 1 };
    const r1 = await rateLimit("user-1", claude);
    const r2 = await rateLimit("user-1", email);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("isolates keys within the same bucket", async () => {
    const { rateLimit } = await import("./rate-limit");
    const opts = { bucket: "shared", windowMs: 60_000, max: 1 };
    const a = await rateLimit("user-A", opts);
    const b = await rateLimit("user-B", opts);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("resets the window after the time elapses", async () => {
    vi.useFakeTimers();
    const { rateLimit } = await import("./rate-limit");
    const opts = { bucket: "expiry", windowMs: 1000, max: 1 };
    const first = await rateLimit("user-1", opts);
    expect(first.allowed).toBe(true);
    const second = await rateLimit("user-1", opts);
    expect(second.allowed).toBe(false);
    // Advance past window boundary
    vi.advanceTimersByTime(1500);
    const third = await rateLimit("user-1", opts);
    expect(third.allowed).toBe(true);
    vi.useRealTimers();
  });

  it("reports decreasing remaining count as requests accumulate", async () => {
    const { rateLimit } = await import("./rate-limit");
    const opts = { bucket: "decrement", windowMs: 60_000, max: 4 };
    const remaining = [];
    for (let i = 0; i < 4; i++) {
      const r = await rateLimit("user-1", opts);
      remaining.push(r.remaining);
    }
    expect(remaining).toEqual([3, 2, 1, 0]);
  });

  it("isRedisConfigured returns false when env vars missing", async () => {
    const { isRedisConfigured } = await import("./rate-limit");
    expect(isRedisConfigured()).toBe(false);
  });

  it("startMemoryCleanup returns a timer that does not throw", async () => {
    const { startMemoryCleanup } = await import("./rate-limit");
    const timer = startMemoryCleanup(1000);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });
});

describe("rate-limit (Redis path)", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    vi.resetModules();
    mockIncr.mockReset();
    mockPexpire.mockReset();
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("calls INCR and PEXPIRE on first hit of a window", async () => {
    mockIncr.mockResolvedValue(1);
    mockPexpire.mockResolvedValue(1);
    const { rateLimit } = await import("./rate-limit");
    const r = await rateLimit("user-1", { bucket: "redis", windowMs: 60_000, max: 5 });
    expect(mockIncr).toHaveBeenCalled();
    expect(mockPexpire).toHaveBeenCalledWith(expect.any(String), 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("does NOT call PEXPIRE on subsequent hits within the window", async () => {
    mockIncr.mockResolvedValue(2);
    const { rateLimit } = await import("./rate-limit");
    await rateLimit("user-1", { bucket: "redis", windowMs: 60_000, max: 5 });
    expect(mockPexpire).not.toHaveBeenCalled();
  });

  it("rejects when Redis count exceeds max", async () => {
    mockIncr.mockResolvedValue(6);
    const { rateLimit } = await import("./rate-limit");
    const r = await rateLimit("user-1", { bucket: "redis", windowMs: 60_000, max: 5 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("fails OPEN to in-memory fallback when Redis throws", async () => {
    mockIncr.mockRejectedValueOnce(new Error("Redis unreachable"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rateLimit } = await import("./rate-limit");
    const r = await rateLimit("user-1", { bucket: "fail-open", windowMs: 60_000, max: 5 });
    expect(r.allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("redis error"),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it("isRedisConfigured returns true when env vars present", async () => {
    const { isRedisConfigured } = await import("./rate-limit");
    expect(isRedisConfigured()).toBe(true);
  });

  it("scopes Redis keys with the wireline:rl prefix to avoid collisions", async () => {
    mockIncr.mockResolvedValue(1);
    mockPexpire.mockResolvedValue(1);
    const { rateLimit } = await import("./rate-limit");
    await rateLimit("user-1", { bucket: "test", windowMs: 60_000, max: 5 });
    const key = mockIncr.mock.calls[0][0];
    expect(key).toMatch(/^wireline:rl:test:user-1:/);
  });
});

describe("distributedLimiterStatus", () => {
  const ENV = process.env;
  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    vi.resetModules();
  });
  afterEach(() => {
    process.env = ENV;
  });

  it("ok when Upstash is configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    process.env.NODE_ENV = "production";
    const { distributedLimiterStatus } = await import("./rate-limit");
    expect(distributedLimiterStatus()).toEqual({ ok: true });
  });

  it("ok in non-production even without Upstash", async () => {
    process.env.NODE_ENV = "development";
    const { distributedLimiterStatus } = await import("./rate-limit");
    expect(distributedLimiterStatus()).toEqual({ ok: true });
  });

  it("FAILS CLOSED in production without Upstash and without opt-in", async () => {
    process.env.NODE_ENV = "production";
    const { distributedLimiterStatus } = await import("./rate-limit");
    const s = distributedLimiterStatus();
    expect(s.ok).toBe(false);
    expect(s.code).toBe("RATE_LIMITER_UNAVAILABLE");
    expect(s.reason).toMatch(/Upstash|in-memory|WIRELINE_ALLOW/i);
  });

  it("FAILS CLOSED on Vercel without Upstash even when NODE_ENV is unset", async () => {
    process.env.VERCEL = "1";
    const { distributedLimiterStatus } = await import("./rate-limit");
    const s = distributedLimiterStatus();
    expect(s.ok).toBe(false);
  });

  it("ok in production when WIRELINE_ALLOW_INMEMORY_RATE_LIMIT=true (single-node opt-in)", async () => {
    process.env.NODE_ENV = "production";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    const { distributedLimiterStatus } = await import("./rate-limit");
    expect(distributedLimiterStatus()).toEqual({ ok: true });
  });

  it("opt-in is case-insensitive", async () => {
    process.env.NODE_ENV = "production";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "TRUE";
    const { distributedLimiterStatus } = await import("./rate-limit");
    expect(distributedLimiterStatus()).toEqual({ ok: true });
  });

  it("does NOT accept any value other than 'true'", async () => {
    process.env.NODE_ENV = "production";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "1";
    const { distributedLimiterStatus } = await import("./rate-limit");
    const s = distributedLimiterStatus();
    expect(s.ok).toBe(false);
  });
});
