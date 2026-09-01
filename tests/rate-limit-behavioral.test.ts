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
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    for (const name of [
      "WIRELINE_PREVIEW_DATABASE_ISOLATED",
      "WIRELINE_LAUNCH_DEMO_MODE",
      "AGENTMAIL_API_KEY",
      "AI_GATEWAY_API_KEY",
      "APOLLO_API_KEY",
      "FEDERAL_DNC_API_KEY",
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_API_KEY_CHATKIT",
      "PERPLEXITY_PREVIEW_API_KEY",
      "RESEND_API_KEY",
      "STRIPE_SECRET_KEY",
      "TWILIO_API_KEY",
      "TWILIO_API_SECRET",
      "TWILIO_AUTH_TOKEN",
      "VAPI_PRIVATE_KEY",
      "VERCEL_OIDC_TOKEN",
      "XAI_API_KEY",
      "XAI_API_KEY_CHATKIT",
    ]) {
      delete process.env[name];
    }
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

  it("returns ok for an acknowledged single-node non-Vercel Production runtime", () => {
    process.env.NODE_ENV = "production";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("returns ok for an isolated provider-free Preview override", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it.each(["WIRELINE_PREVIEW_DATABASE_ISOLATED", "WIRELINE_LAUNCH_DEMO_MODE"])(
    "fails closed when isolated Preview is missing %s",
    (missing) => {
      process.env.VERCEL_ENV = "preview";
      process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
      process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
      process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
      delete process.env[missing];
      expect(distributedLimiterStatus()).toMatchObject({
        ok: false,
        code: "RATE_LIMITER_UNAVAILABLE",
      });
    },
  );

  it.each([
    "AGENTMAIL_API_KEY",
    "AI_GATEWAY_API_KEY",
    "APOLLO_API_KEY",
    "FEDERAL_DNC_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_CHATKIT",
    "PERPLEXITY_PREVIEW_API_KEY",
    "RESEND_API_KEY",
    "STRIPE_SECRET_KEY",
    "TWILIO_API_KEY",
    "TWILIO_API_SECRET",
    "TWILIO_AUTH_TOKEN",
    "VAPI_PRIVATE_KEY",
    "XAI_API_KEY",
    "XAI_API_KEY_CHATKIT",
  ])("fails closed when isolated Preview inherits %s", (name) => {
    process.env.VERCEL_ENV = "preview";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    process.env[name] = "live-provider-authority";
    expect(distributedLimiterStatus()).toMatchObject({
      ok: false,
      code: "RATE_LIMITER_UNAVAILABLE",
    });
  });

  it("does not treat inert Preview OIDC as usable provider authority", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    process.env.VERCEL_OIDC_TOKEN = "automatic-preview-oidc";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("refuses the in-memory override on Vercel Production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    expect(distributedLimiterStatus()).toMatchObject({
      ok: false,
      code: "RATE_LIMITER_UNAVAILABLE",
    });
  });

  it.each(["preview", "production"])(
    "requires distributed limiting for VERCEL_ENV=%s even when NODE_ENV is development",
    (vercelEnvironment) => {
      process.env.VERCEL_ENV = vercelEnvironment;
      process.env.NODE_ENV = "development";
      expect(distributedLimiterStatus()).toMatchObject({
        ok: false,
        code: "RATE_LIMITER_UNAVAILABLE",
      });
    },
  );

  it("returns ok in non-production environment without Redis", () => {
    process.env.NODE_ENV = "development";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("returns ok in the clean-room Vercel development identity without Redis", () => {
    process.env.VERCEL_ENV = "development";
    process.env.NODE_ENV = "development";
    expect(distributedLimiterStatus().ok).toBe(true);
  });

  it("requires distributed limiting when the Vercel development identity is running on Vercel", () => {
    process.env.VERCEL_ENV = "development";
    process.env.VERCEL = "1";
    process.env.NODE_ENV = "development";
    expect(distributedLimiterStatus()).toMatchObject({
      ok: false,
      code: "RATE_LIMITER_UNAVAILABLE",
    });
  });

  it("fails closed for an unknown Vercel environment identity", () => {
    process.env.VERCEL_ENV = "unexpected";
    process.env.NODE_ENV = "development";
    expect(distributedLimiterStatus()).toMatchObject({
      ok: false,
      code: "RATE_LIMITER_UNAVAILABLE",
    });
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
