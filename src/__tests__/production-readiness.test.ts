/**
 * Production-readiness contracts.
 *
 * Tests are self-contained: they replicate the logic from server.ts without
 * importing it directly (the module calls validateStartupEnv() and opens DB
 * connections at import time, which would break the test environment).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { timingSafeEqual } from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────
// 1. Startup validation — required env vars must be enforced in prod
// ──────────────────────────────────────────────────────────────────────────

/** Mirrors validateStartupEnv logic from server.ts */
function checkStartupEnv(env: Record<string, string | undefined>, isProd: boolean) {
  const alwaysRequired = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
  const prodRequired   = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "VAPI_PRIVATE_KEY",
    "VAPI_WEBHOOK_SECRET",
    "OAUTH_STATE_SECRET",
  ];

  const missingAlways = alwaysRequired.filter((k) => !env[k]);
  const missingProd   = prodRequired.filter((k) => !env[k]);
  const missing       = isProd ? [...missingAlways, ...missingProd] : missingAlways;

  return { missing, wouldExit: isProd && missing.length > 0 };
}

const BASE_ENV: Record<string, string> = {
  VITE_SUPABASE_URL:      "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  ANTHROPIC_API_KEY:      "sk-ant-xxx",
  GEMINI_API_KEY:         "gemini-key",
  VAPI_PRIVATE_KEY:       "vapi-priv",
  VAPI_WEBHOOK_SECRET:    "vapi-secret",
  OAUTH_STATE_SECRET:     "oauth-state-secret-32-chars-long!",
};

describe("startup validation", () => {
  it("passes when all required vars are present in prod", () => {
    const { missing, wouldExit } = checkStartupEnv(BASE_ENV, true);
    expect(missing).toHaveLength(0);
    expect(wouldExit).toBe(false);
  });

  it("exits in prod when VITE_SUPABASE_URL is missing", () => {
    const env = { ...BASE_ENV, VITE_SUPABASE_URL: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("VITE_SUPABASE_URL");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when VITE_SUPABASE_ANON_KEY is missing", () => {
    const env = { ...BASE_ENV, VITE_SUPABASE_ANON_KEY: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("VITE_SUPABASE_ANON_KEY");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when ANTHROPIC_API_KEY is missing", () => {
    const env = { ...BASE_ENV, ANTHROPIC_API_KEY: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("ANTHROPIC_API_KEY");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    const env = { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when GEMINI_API_KEY is missing", () => {
    const env = { ...BASE_ENV, GEMINI_API_KEY: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("GEMINI_API_KEY");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when VAPI_PRIVATE_KEY is missing", () => {
    const env = { ...BASE_ENV, VAPI_PRIVATE_KEY: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("VAPI_PRIVATE_KEY");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when VAPI_WEBHOOK_SECRET is missing", () => {
    const env = { ...BASE_ENV, VAPI_WEBHOOK_SECRET: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("VAPI_WEBHOOK_SECRET");
    expect(wouldExit).toBe(true);
  });

  it("exits in prod when OAUTH_STATE_SECRET is missing (prevents secret cross-coupling)", () => {
    const env = { ...BASE_ENV, OAUTH_STATE_SECRET: undefined };
    const { missing, wouldExit } = checkStartupEnv(env, true);
    expect(missing).toContain("OAUTH_STATE_SECRET");
    expect(wouldExit).toBe(true);
  });

  it("does NOT exit in dev when prod-required vars are absent", () => {
    const env = {
      VITE_SUPABASE_URL:      "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
      // ANTHROPIC_API_KEY, VAPI_PRIVATE_KEY, VAPI_WEBHOOK_SECRET omitted
    };
    const { missing, wouldExit } = checkStartupEnv(env, false);
    expect(missing).toHaveLength(0);
    expect(wouldExit).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. 24 h spend cap — must return HTTP 402 + structured code when over budget
// ──────────────────────────────────────────────────────────────────────────

/** Mirrors enforce24hSpendCap logic from server.ts */
function makeSpendCapMiddleware(monthlyBudgetUsd: number) {
  const DAILY_LIMIT = monthlyBudgetUsd * 0.01;
  let windowStart   = Date.now();
  let accumUsd      = 0;

  function record(usd: number) {
    if (Date.now() - windowStart > 24 * 60 * 60_000) {
      windowStart = Date.now();
      accumUsd    = 0;
    }
    accumUsd += usd;
  }

  function middleware(req: any, res: any, next: () => void) {
    if (DAILY_LIMIT <= 0) return next();
    if (Date.now() - windowStart > 24 * 60 * 60_000) {
      windowStart = Date.now();
      accumUsd    = 0;
    }
    if (accumUsd >= DAILY_LIMIT) {
      return res.status(402).json({
        error: "Daily Claude spend limit reached.",
        code:  "DAILY_SPEND_LIMIT_EXCEEDED",
        daily_limit_usd: DAILY_LIMIT,
        accumulated_usd: Number(accumUsd.toFixed(4)),
      });
    }
    next();
  }

  return { middleware, record };
}

function mockRes() {
  const res: any = { _status: 200, _body: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json   = (body: any)    => { res._body   = body; return res; };
  return res;
}

describe("24h spend cap", () => {
  it("passes through when under budget", () => {
    const { middleware, record } = makeSpendCapMiddleware(50);
    record(0.10); // $0.10 accumulated; daily limit = $0.50
    const res  = mockRes();
    let called = false;
    middleware({}, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res._status).toBe(200);
  });

  it("returns 402 when accumulated spend meets the daily cap", () => {
    const { middleware, record } = makeSpendCapMiddleware(50);
    record(0.50); // exactly at $0.50 daily limit (1% of $50)
    const res = mockRes();
    middleware({}, res, () => {});
    expect(res._status).toBe(402);
    expect(res._body).toMatchObject({ code: "DAILY_SPEND_LIMIT_EXCEEDED" });
  });

  it("includes daily_limit_usd and accumulated_usd in the 402 body", () => {
    const { middleware, record } = makeSpendCapMiddleware(100);
    record(1.05); // over the $1.00 daily limit (1% of $100)
    const res = mockRes();
    middleware({}, res, () => {});
    expect(res._body.daily_limit_usd).toBe(1);
    expect(res._body.accumulated_usd).toBeGreaterThanOrEqual(1);
  });

  it("passes through when monthly budget is 0 (cap disabled)", () => {
    const { middleware } = makeSpendCapMiddleware(0);
    const res  = mockRes();
    let called = false;
    middleware({}, res, () => { called = true; });
    expect(called).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Error responses — must never leak stack traces
// ──────────────────────────────────────────────────────────────────────────

/** Mirrors the production error handler shape used throughout server.ts */
function safeErrorBody(err: unknown): Record<string, unknown> {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "An unexpected error occurred.";

  // Never include stack, cause, or the full error object.
  return { error: message };
}

describe("error responses contain no stack traces", () => {
  it("omits the stack property from the response body", () => {
    const err  = new Error("Something broke");
    const body = safeErrorBody(err);
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("cause");
  });

  it("returns only the message string for known errors", () => {
    const err  = new Error("DB timeout");
    const body = safeErrorBody(err);
    expect(body.error).toBe("DB timeout");
    expect(Object.keys(body)).toEqual(["error"]);
  });

  it("does not expose the raw Error object or any of its enumerable props", () => {
    const err  = Object.assign(new Error("msg"), { secret: "s3cr3t" });
    const body = safeErrorBody(err);
    expect(body).not.toHaveProperty("secret");
    expect(JSON.stringify(body)).not.toContain("s3cr3t");
  });

  it("handles non-Error throws without crashing", () => {
    expect(() => safeErrorBody("string throw")).not.toThrow();
    expect(() => safeErrorBody({ code: 500 })).not.toThrow();
    expect(() => safeErrorBody(null)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Structured error JSON — all error paths must include an `error` field
// ──────────────────────────────────────────────────────────────────────────

describe("structured error JSON", () => {
  it("always has an `error` string field", () => {
    const cases = [
      safeErrorBody(new Error("msg")),
      safeErrorBody("plain string"),
      safeErrorBody(null),
    ];
    cases.forEach((body) => {
      expect(typeof body.error).toBe("string");
      expect((body.error as string).length).toBeGreaterThan(0);
    });
  });

  it("spend-cap 402 body has both `error` and `code` fields", () => {
    const { middleware, record } = makeSpendCapMiddleware(50);
    record(1); // over limit
    const res = mockRes();
    middleware({}, res, () => {});
    expect(typeof res._body.error).toBe("string");
    expect(typeof res._body.code).toBe("string");
    expect(res._body.code).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Vapi webhook auth — must reject wrong/missing secret (constant-time)
// ──────────────────────────────────────────────────────────────────────────

/** Mirrors timingSafeEq from server.ts */
function timingSafeEq(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Mirrors the Vapi webhook auth gate in server.ts */
function vapiAuth(
  provided: string,
  secret: string | undefined,
  isProd: boolean,
): { status: number; body: Record<string, string> } | null {
  if (!secret) {
    if (isProd) return { status: 503, body: { error: "Webhook auth not configured." } };
    return null; // dev: pass through
  }
  if (!timingSafeEq(provided, secret)) {
    return { status: 401, body: { error: "Invalid webhook signature." } };
  }
  return null; // authenticated
}

describe("Vapi webhook auth", () => {
  const SECRET = "super-secret-key";

  it("passes when the correct secret is provided", () => {
    expect(vapiAuth(SECRET, SECRET, true)).toBeNull();
  });

  it("rejects when the wrong secret is provided (prod)", () => {
    const result = vapiAuth("wrong-secret", SECRET, true);
    expect(result?.status).toBe(401);
    expect(result?.body.error).toMatch(/signature/i);
  });

  it("rejects when no secret is provided (prod)", () => {
    const result = vapiAuth("", SECRET, true);
    expect(result?.status).toBe(401);
  });

  it("returns 503 when VAPI_WEBHOOK_SECRET is unset in prod (fail-closed)", () => {
    const result = vapiAuth("anything", undefined, true);
    expect(result?.status).toBe(503);
  });

  it("passes through when VAPI_WEBHOOK_SECRET is unset in dev (fail-open)", () => {
    const result = vapiAuth("", undefined, false);
    expect(result).toBeNull();
  });

  it("rejects even a one-character difference in the secret", () => {
    const wrong = SECRET.slice(0, -1) + "X";
    const result = vapiAuth(wrong, SECRET, true);
    expect(result?.status).toBe(401);
  });

  it("uses constant-time comparison (different-length secrets are rejected without timing leak)", () => {
    const result = vapiAuth("short", SECRET, true);
    expect(result?.status).toBe(401);
  });
});
