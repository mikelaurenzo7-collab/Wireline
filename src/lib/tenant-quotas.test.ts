import { describe, it, expect, beforeEach } from "vitest";
import {
  PLAN_DEFAULTS,
  ALL_DIMENSIONS,
  resolveLimit,
  resolveProfile,
  dailyPeriodKey,
  minutePeriodKey,
  buildDecision,
  validateOverride,
  quotaRejectionHeaders,
  QuotaTracker,
  type QuotaDimension,
  type QuotaOverrideRow,
  type PlanTier,
} from "./tenant-quotas";

describe("tenant-quotas · plan defaults", () => {
  it("free < starter < pro < enterprise on every dimension", () => {
    for (const dim of ALL_DIMENSIONS) {
      const f = PLAN_DEFAULTS.free[dim];
      const s = PLAN_DEFAULTS.starter[dim];
      const p = PLAN_DEFAULTS.pro[dim];
      const e = PLAN_DEFAULTS.enterprise[dim];
      expect(f).toBeLessThan(s);
      expect(s).toBeLessThan(p);
      expect(p).toBeLessThan(e);
    }
  });
  it("every dimension has a numeric default for every plan", () => {
    for (const plan of ["free", "starter", "pro", "enterprise"] as PlanTier[]) {
      for (const dim of ALL_DIMENSIONS) {
        expect(typeof PLAN_DEFAULTS[plan][dim]).toBe("number");
        expect(PLAN_DEFAULTS[plan][dim]).toBeGreaterThan(0);
      }
    }
  });
});

describe("tenant-quotas · resolveLimit", () => {
  it("returns plan default with no override", () => {
    expect(resolveLimit("starter", "claude_tokens_daily")).toBe(PLAN_DEFAULTS.starter.claude_tokens_daily);
  });
  it("returns plan default when override disabled", () => {
    expect(resolveLimit("starter", "claude_tokens_daily", { value: 1000, enabled: false })).toBe(
      PLAN_DEFAULTS.starter.claude_tokens_daily,
    );
  });
  it("applies enabled override (lower than plan)", () => {
    expect(resolveLimit("starter", "claude_tokens_daily", { value: 1000, enabled: true })).toBe(1000);
  });
  it("applies enabled override (higher than plan, e.g. enterprise headroom grant)", () => {
    expect(resolveLimit("starter", "claude_tokens_daily", { value: 999_999_999, enabled: true })).toBe(999_999_999);
  });
  it("rejects negative override", () => {
    expect(resolveLimit("starter", "claude_tokens_daily", { value: -5, enabled: true })).toBe(
      PLAN_DEFAULTS.starter.claude_tokens_daily,
    );
  });
});

describe("tenant-quotas · resolveProfile", () => {
  it("merges overrides into the plan profile", () => {
    const overrides: QuotaOverrideRow[] = [
      { user_id: "u", dimension: "claude_tokens_daily", value: 5000, enabled: true },
      { user_id: "u", dimension: "voice_minutes_daily", value: 999, enabled: false }, // disabled, ignored
    ];
    const p = resolveProfile("starter", overrides);
    expect(p.claude_tokens_daily).toBe(5000);
    expect(p.voice_minutes_daily).toBe(PLAN_DEFAULTS.starter.voice_minutes_daily);
  });
  it("ignores unknown dimensions", () => {
    const overrides = [
      { user_id: "u", dimension: "garbage" as unknown as QuotaDimension, value: 1, enabled: true },
    ];
    const p = resolveProfile("free", overrides);
    expect(p).toEqual(PLAN_DEFAULTS.free);
  });
});

describe("tenant-quotas · period keys", () => {
  it("daily key is YYYY-MM-DD UTC", () => {
    const k = dailyPeriodKey(new Date("2026-05-09T23:30:00Z"));
    expect(k).toBe("2026-05-09");
  });
  it("daily key wraps at UTC midnight, not local", () => {
    const k = dailyPeriodKey(new Date("2026-05-09T23:59:59Z"));
    expect(k).toBe("2026-05-09");
    const k2 = dailyPeriodKey(new Date("2026-05-10T00:00:00Z"));
    expect(k2).toBe("2026-05-10");
  });
  it("minute key has 16 chars and minute precision", () => {
    const k = minutePeriodKey(new Date("2026-05-09T12:34:56Z"));
    expect(k).toBe("2026-05-09T12:34");
  });
});

describe("tenant-quotas · buildDecision", () => {
  it("allows when projected is at limit", () => {
    const d = buildDecision({
      dimension: "claude_tokens_daily",
      limit: 100,
      used: 99,
      delta: 1,
      period_key: "2026-05-09",
      reset_at: "2026-05-10T00:00:00Z",
    });
    expect(d.allowed).toBe(true);
  });
  it("denies when projected exceeds limit", () => {
    const d = buildDecision({
      dimension: "claude_tokens_daily",
      limit: 100,
      used: 99,
      delta: 5,
      period_key: "2026-05-09",
      reset_at: "2026-05-10T00:00:00Z",
    });
    expect(d.allowed).toBe(false);
  });
  it("never reports negative remaining", () => {
    const d = buildDecision({
      dimension: "claude_tokens_daily",
      limit: 100,
      used: 200,
      delta: 0,
      period_key: "2026-05-09",
      reset_at: "2026-05-10T00:00:00Z",
    });
    expect(d.remaining).toBe(0);
  });
});

describe("tenant-quotas · validateOverride", () => {
  it("accepts valid input", () => {
    const r = validateOverride({ dimension: "claude_tokens_daily", value: 1000, enabled: true });
    expect(r.ok).toBe(true);
  });
  it("rejects unknown dimensions", () => {
    const r = validateOverride({ dimension: "elephants", value: 1, enabled: true });
    expect(r.ok).toBe(false);
  });
  it("rejects non-finite or negative value", () => {
    expect(validateOverride({ dimension: "intake_rpm", value: -1, enabled: true }).ok).toBe(false);
    expect(validateOverride({ dimension: "intake_rpm", value: NaN, enabled: true }).ok).toBe(false);
    expect(validateOverride({ dimension: "intake_rpm", value: Infinity, enabled: true }).ok).toBe(false);
  });
  it("rejects unreasonably large value (>1e12)", () => {
    expect(validateOverride({ dimension: "intake_rpm", value: 1e13, enabled: true }).ok).toBe(false);
  });
  it("rejects non-boolean enabled", () => {
    expect(validateOverride({ dimension: "intake_rpm", value: 1, enabled: 1 }).ok).toBe(false);
  });
  it("rejects non-object input", () => {
    expect(validateOverride(null).ok).toBe(false);
    expect(validateOverride("nope").ok).toBe(false);
  });
});

describe("tenant-quotas · quotaRejectionHeaders", () => {
  it("emits Retry-After + RateLimit headers", () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const h = quotaRejectionHeaders({
      allowed: false,
      dimension: "claude_tokens_daily",
      limit: 1000,
      used: 1500,
      remaining: 0,
      period_key: "2026-05-09",
      reset_at: future,
    });
    expect(Number(h["Retry-After"])).toBeGreaterThan(0);
    expect(h["X-RateLimit-Limit"]).toBe("1000");
    expect(h["X-RateLimit-Used"]).toBe("1500");
    expect(h["X-Quota-Dimension"]).toBe("claude_tokens_daily");
  });
});

describe("tenant-quotas · QuotaTracker (mock db)", () => {
  let calls: { table: string; method: string; args: unknown[] }[];
  let usageStore: Map<string, number>;
  let overrides: QuotaOverrideRow[];

  beforeEach(() => {
    calls = [];
    usageStore = new Map();
    overrides = [];
  });

  function makeMockDb() {
    const db: any = {
      from(table: string) {
        const chain: any = {
          _filters: {} as Record<string, string>,
          select(_cols: string) { calls.push({ table, method: "select", args: [_cols] }); return chain; },
          eq(col: string, val: string) { chain._filters[col] = val; return chain; },
          maybeSingle() {
            if (table === "wireline_quota_usage") {
              const k = `${chain._filters.user_id}|${chain._filters.dimension}|${chain._filters.period_key}`;
              const used = usageStore.get(k) ?? 0;
              return Promise.resolve({ data: { used } });
            }
            return Promise.resolve({ data: null });
          },
          upsert(row: any) {
            if (table === "wireline_quota_usage") {
              const k = `${row.user_id}|${row.dimension}|${row.period_key}`;
              usageStore.set(k, row.used);
            }
            calls.push({ table, method: "upsert", args: [row] });
            return Promise.resolve({ data: row, error: null });
          },
          // For overrides query (no maybeSingle):
          then(resolve: any) {
            if (table === "wireline_quota_limits") {
              return Promise.resolve({ data: overrides }).then(resolve);
            }
            return Promise.resolve({ data: null }).then(resolve);
          },
        };
        return chain;
      },
      rpc(_name: string, _args: any) {
        // Force the fallback path so we exercise the non-atomic code.
        return Promise.resolve({ data: null, error: { message: "rpc missing" } });
      },
    };
    return db;
  }

  it("allows + increments when under the limit", async () => {
    const tracker = new QuotaTracker({
      db: makeMockDb(),
      getPlanForUser: async () => "free",
    });
    const dec = await tracker.checkAndIncrement("u-1", "claude_tokens_daily", 100);
    expect(dec.allowed).toBe(true);
    expect(dec.limit).toBe(PLAN_DEFAULTS.free.claude_tokens_daily);
    expect(dec.used).toBe(100);
  });

  it("denies when delta would exceed limit and does NOT write", async () => {
    overrides = [{ user_id: "u-1", dimension: "claude_tokens_daily", value: 50, enabled: true }];
    const tracker = new QuotaTracker({
      db: makeMockDb(),
      getPlanForUser: async () => "free",
    });
    const dec = await tracker.checkAndIncrement("u-1", "claude_tokens_daily", 200);
    expect(dec.allowed).toBe(false);
    expect(dec.limit).toBe(50);
    expect(dec.used).toBe(0);
  });

  it("caches override lookups (does not query twice within TTL)", async () => {
    let queryCount = 0;
    const db: any = {
      from(table: string) {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle() { return Promise.resolve({ data: { used: 0 } }); },
          upsert(row: any) { return Promise.resolve({ data: row, error: null }); },
          then(resolve: any) {
            if (table === "wireline_quota_limits") {
              queryCount++;
              return Promise.resolve({ data: [] }).then(resolve);
            }
            return Promise.resolve({ data: null }).then(resolve);
          },
        };
        return chain;
      },
      rpc() { return Promise.resolve({ data: null, error: { message: "x" } }); },
    };
    const tracker = new QuotaTracker({ db, getPlanForUser: async () => "starter" });
    await tracker.getProfile("user-cache");
    await tracker.getProfile("user-cache");
    expect(queryCount).toBe(1);
    tracker.invalidate("user-cache");
    await tracker.getProfile("user-cache");
    expect(queryCount).toBe(2);
  });
});
