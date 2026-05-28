import { describe, expect, it, vi } from "vitest";
import {
  resolveLimit,
  resolveProfile,
  dailyPeriodKey,
  minutePeriodKey,
  buildDecision,
  validateOverride,
  quotaRejectionHeaders,
  PLAN_DEFAULTS,
  ALL_DIMENSIONS,
} from "./tenant-quotas";

// The class methods use drizzle / schema — mock them out so the module loads
// cleanly and doesn't attempt a real DB connection.
vi.mock("./server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── resolveLimit ───────────────────────────────────────────────────────────

describe("resolveLimit", () => {
  it("returns the plan default when no override is passed", () => {
    expect(resolveLimit("starter", "voice_minutes_daily")).toBe(
      PLAN_DEFAULTS.starter.voice_minutes_daily,
    );
  });

  it("returns the plan default when the override is disabled", () => {
    expect(resolveLimit("starter", "voice_minutes_daily", { value: 5, enabled: false })).toBe(
      PLAN_DEFAULTS.starter.voice_minutes_daily,
    );
  });

  it("returns the override value when it is enabled", () => {
    expect(resolveLimit("starter", "voice_minutes_daily", { value: 999, enabled: true })).toBe(999);
  });

  it("honors an override that is higher than the plan default", () => {
    const base = PLAN_DEFAULTS.free.voice_minutes_daily;
    expect(resolveLimit("free", "voice_minutes_daily", { value: base + 100, enabled: true })).toBe(
      base + 100,
    );
  });

  it("returns the plan default when override value is NaN", () => {
    expect(resolveLimit("pro", "claude_tokens_daily", { value: NaN, enabled: true })).toBe(
      PLAN_DEFAULTS.pro.claude_tokens_daily,
    );
  });

  it("returns the plan default when override value is negative", () => {
    expect(resolveLimit("pro", "claude_tokens_daily", { value: -1, enabled: true })).toBe(
      PLAN_DEFAULTS.pro.claude_tokens_daily,
    );
  });

  it("accepts zero as a valid override value", () => {
    expect(resolveLimit("starter", "voice_minutes_daily", { value: 0, enabled: true })).toBe(0);
  });

  it("returns plan default when override is null", () => {
    expect(resolveLimit("pro", "voice_minutes_daily", null)).toBe(
      PLAN_DEFAULTS.pro.voice_minutes_daily,
    );
  });
});

// ─── resolveProfile ─────────────────────────────────────────────────────────

describe("resolveProfile", () => {
  it("returns a copy of plan defaults when there are no overrides", () => {
    const profile = resolveProfile("starter", []);
    expect(profile).toEqual(PLAN_DEFAULTS.starter);
  });

  it("applies an enabled override to a dimension", () => {
    const profile = resolveProfile("starter", [
      { user_id: "u1", dimension: "voice_minutes_daily", value: 200, enabled: true },
    ]);
    expect(profile.voice_minutes_daily).toBe(200);
    // Other dimensions are unchanged
    expect(profile.claude_tokens_daily).toBe(PLAN_DEFAULTS.starter.claude_tokens_daily);
  });

  it("ignores a disabled override", () => {
    const profile = resolveProfile("starter", [
      { user_id: "u1", dimension: "voice_minutes_daily", value: 5, enabled: false },
    ]);
    expect(profile.voice_minutes_daily).toBe(PLAN_DEFAULTS.starter.voice_minutes_daily);
  });

  it("ignores overrides with unknown dimension names", () => {
    const profile = resolveProfile("starter", [
      { user_id: "u1", dimension: "nonexistent_dim" as any, value: 1, enabled: true },
    ]);
    expect(profile).toEqual(PLAN_DEFAULTS.starter);
  });

  it("applies multiple overrides independently", () => {
    const profile = resolveProfile("pro", [
      { user_id: "u1", dimension: "voice_minutes_daily", value: 50, enabled: true },
      { user_id: "u1", dimension: "concurrent_dials", value: 3, enabled: true },
    ]);
    expect(profile.voice_minutes_daily).toBe(50);
    expect(profile.concurrent_dials).toBe(3);
    expect(profile.claude_tokens_daily).toBe(PLAN_DEFAULTS.pro.claude_tokens_daily);
  });
});

// ─── dailyPeriodKey ─────────────────────────────────────────────────────────

describe("dailyPeriodKey", () => {
  it("returns a YYYY-MM-DD string for a given date", () => {
    expect(dailyPeriodKey(new Date("2026-05-28T23:59:59.000Z"))).toBe("2026-05-28");
  });

  it("uses UTC midnight rollover (not local time)", () => {
    expect(dailyPeriodKey(new Date("2026-05-29T00:00:00.000Z"))).toBe("2026-05-29");
  });

  it("uses the current date when no argument is passed", () => {
    const key = dailyPeriodKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── minutePeriodKey ────────────────────────────────────────────────────────

describe("minutePeriodKey", () => {
  it("returns a YYYY-MM-DDTHH:MM string for a given date", () => {
    expect(minutePeriodKey(new Date("2026-05-28T14:37:45.000Z"))).toBe("2026-05-28T14:37");
  });

  it("truncates to the minute (seconds are dropped)", () => {
    expect(minutePeriodKey(new Date("2026-05-28T14:37:59.999Z"))).toBe("2026-05-28T14:37");
  });

  it("uses the current time when no argument is passed", () => {
    const key = minutePeriodKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ─── buildDecision ──────────────────────────────────────────────────────────

describe("buildDecision", () => {
  const base = {
    dimension: "voice_minutes_daily" as const,
    period_key: "2026-05-28",
    reset_at: "2026-05-29T00:00:00.000Z",
  };

  it("marks allowed when projected usage is below the limit", () => {
    const d = buildDecision({ ...base, limit: 60, used: 50, delta: 5 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(10);
  });

  it("marks allowed when projected usage exactly equals the limit", () => {
    const d = buildDecision({ ...base, limit: 60, used: 55, delta: 5 });
    expect(d.allowed).toBe(true);
  });

  it("marks not allowed when projected usage exceeds the limit", () => {
    const d = buildDecision({ ...base, limit: 60, used: 56, delta: 5 });
    expect(d.allowed).toBe(false);
  });

  it("remaining is never negative when used exceeds limit", () => {
    const d = buildDecision({ ...base, limit: 10, used: 20, delta: 0 });
    expect(d.remaining).toBe(0);
  });

  it("populates all fields correctly", () => {
    const d = buildDecision({ ...base, limit: 100, used: 30, delta: 10 });
    expect(d.dimension).toBe("voice_minutes_daily");
    expect(d.limit).toBe(100);
    expect(d.used).toBe(30);
    expect(d.period_key).toBe("2026-05-28");
    expect(d.reset_at).toBe("2026-05-29T00:00:00.000Z");
  });

  it("handles delta of 0 (a read-only quota check)", () => {
    const d = buildDecision({ ...base, limit: 100, used: 60, delta: 0 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(40);
  });
});

// ─── validateOverride ───────────────────────────────────────────────────────

describe("validateOverride", () => {
  const valid = { dimension: "voice_minutes_daily", value: 100, enabled: true };

  it("accepts a valid override request", () => {
    const result = validateOverride(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(valid);
  });

  it("accepts all known dimensions", () => {
    for (const dim of ALL_DIMENSIONS) {
      const result = validateOverride({ dimension: dim, value: 1, enabled: true });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts value = 0 (zero-cap override)", () => {
    const result = validateOverride({ ...valid, value: 0 });
    expect(result.ok).toBe(true);
  });

  it("accepts enabled = false", () => {
    const result = validateOverride({ ...valid, enabled: false });
    expect(result.ok).toBe(true);
  });

  it("rejects null input", () => {
    expect(validateOverride(null)).toMatchObject({ ok: false });
  });

  it("rejects a string input", () => {
    expect(validateOverride("str")).toMatchObject({ ok: false });
  });

  it("rejects an unknown dimension", () => {
    const result = validateOverride({ ...valid, dimension: "unknown_dim" });
    expect(result.ok).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(validateOverride({ ...valid, value: -1 })).toMatchObject({ ok: false });
  });

  it("rejects a value above 1e12", () => {
    expect(validateOverride({ ...valid, value: 1e13 })).toMatchObject({ ok: false });
  });

  it("rejects NaN value", () => {
    expect(validateOverride({ ...valid, value: NaN })).toMatchObject({ ok: false });
  });

  it("rejects Infinity value", () => {
    expect(validateOverride({ ...valid, value: Infinity })).toMatchObject({ ok: false });
  });

  it("rejects a non-boolean enabled field", () => {
    expect(validateOverride({ ...valid, enabled: "yes" as any })).toMatchObject({ ok: false });
    expect(validateOverride({ ...valid, enabled: 1 as any })).toMatchObject({ ok: false });
  });

  it("rejects missing dimension", () => {
    const { dimension: _d, ...rest } = valid;
    expect(validateOverride(rest)).toMatchObject({ ok: false });
  });
});

// ─── quotaRejectionHeaders ──────────────────────────────────────────────────

describe("quotaRejectionHeaders", () => {
  const makeDecision = (overrides = {}) => ({
    allowed: false,
    dimension: "voice_minutes_daily" as const,
    limit: 100,
    used: 95,
    remaining: 5,
    period_key: "2026-05-28",
    reset_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  });

  it("includes all expected header keys", () => {
    const headers = quotaRejectionHeaders(makeDecision());
    expect(headers).toHaveProperty("Retry-After");
    expect(headers).toHaveProperty("X-RateLimit-Limit");
    expect(headers).toHaveProperty("X-RateLimit-Used");
    expect(headers).toHaveProperty("X-RateLimit-Remaining");
    expect(headers).toHaveProperty("X-RateLimit-Reset");
    expect(headers).toHaveProperty("X-Quota-Dimension");
  });

  it("encodes limit, used, remaining as strings", () => {
    const headers = quotaRejectionHeaders(makeDecision({ limit: 100, used: 95, remaining: 5 }));
    expect(headers["X-RateLimit-Limit"]).toBe("100");
    expect(headers["X-RateLimit-Used"]).toBe("95");
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
  });

  it("encodes the dimension name", () => {
    const headers = quotaRejectionHeaders(makeDecision({ dimension: "claude_tokens_daily" }));
    expect(headers["X-Quota-Dimension"]).toBe("claude_tokens_daily");
  });

  it("Retry-After is at least 1 second for a future reset_at", () => {
    const headers = quotaRejectionHeaders(makeDecision());
    expect(Number(headers["Retry-After"])).toBeGreaterThanOrEqual(1);
  });

  it("Retry-After is clamped to 1 when reset_at is in the past", () => {
    const headers = quotaRejectionHeaders(
      makeDecision({ reset_at: new Date(Date.now() - 5_000).toISOString() }),
    );
    expect(Number(headers["Retry-After"])).toBe(1);
  });
});
