/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Per-tenant quotas — daily/monthly hard caps on the dimensions
// that translate directly to vendor cost or shared-resource pressure.
//
// Three scopes:
//   • claude_tokens_daily   — input+output Anthropic tokens per UTC day
//   • voice_minutes_daily   — sum of Vapi call durations per UTC day
//   • api_requests_per_min  — burst rate cap on /api/* (per user)
//
// The ENFORCED LIMIT is `min(plan_default, per_tenant_override)`. Plan
// defaults live here so a fresh deploy without any wireline_quota_limits
// rows still has sensible caps. The DB table only stores OVERRIDES.
//
// Counters are kept in Postgres (atomic UPSERT + delta) so they survive
// serverless cold starts. For burst-rate limits the Upstash Redis
// rate-limiter (see rate-limit.ts) handles per-second enforcement;
// this module is for daily / monthly accounting.

import { eq, sql, and } from "drizzle-orm";
import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { log } from "./server-context";
import { voiceMinutesDailyQuotaForTier } from "./plan-entitlements";

// ─────────────────────────────────────────────────────────────────
// Plan defaults
// ─────────────────────────────────────────────────────────────────

export type PlanTier = "free" | "personal" | "team" | "business" | "enterprise";

export interface QuotaProfile {
  /** Anthropic input+output tokens per UTC day. */
  claude_tokens_daily: number;
  /** Sum of Vapi call duration in minutes per UTC day. */
  voice_minutes_daily: number;
  /** Concurrent in-flight outbound dials per tenant. */
  concurrent_dials: number;
  /** Knowledge-base storage rows per tenant. */
  knowledge_rows: number;
  /** Lead-intake API requests per minute per tenant. */
  intake_rpm: number;
  /**
   * Live-simulation minutes per UTC day (OpenAI Realtime test sessions,
   * plus any optional Grok experiment path). Each session mint charges its 5-minute secret TTL — the
   * per-minute rate limiter stops bursts, this stops a tenant running
   * back-to-back realtime sessions all day on vendor-metered keys.
   */
  simulation_minutes_daily: number;
}

// Daily voice-minute caps are derived from the current catalog by
// voiceMinutesDailyQuotaForTier(plan). The defaults below are fallback profile
// values for non-voice dimensions and for degraded catalog lookups.
export const PLAN_DEFAULTS: Record<PlanTier, QuotaProfile> = {
  free: {
    claude_tokens_daily: 200_000,
    voice_minutes_daily: 10,
    concurrent_dials: 1,
    knowledge_rows: 200,
    intake_rpm: 10,
    simulation_minutes_daily: 15,
  },
  personal: {
    claude_tokens_daily: 300_000,
    voice_minutes_daily: 10,
    concurrent_dials: 2,
    knowledge_rows: 500,
    intake_rpm: 30,
    simulation_minutes_daily: 30,
  },
  team: {
    claude_tokens_daily: 4_000_000,
    voice_minutes_daily: 36,
    concurrent_dials: 10,
    knowledge_rows: 5_000,
    intake_rpm: 100,
    simulation_minutes_daily: 90,
  },
  business: {
    claude_tokens_daily: 8_000_000,
    voice_minutes_daily: 120,
    concurrent_dials: 25,
    knowledge_rows: 20_000,
    intake_rpm: 240,
    simulation_minutes_daily: 180,
  },
  enterprise: {
    claude_tokens_daily: 20_000_000,
    voice_minutes_daily: 360,
    concurrent_dials: 50,
    knowledge_rows: 50_000,
    intake_rpm: 600,
    simulation_minutes_daily: 360,
  },
};

export type QuotaDimension = keyof QuotaProfile;

export const ALL_DIMENSIONS: QuotaDimension[] = [
  "claude_tokens_daily",
  "voice_minutes_daily",
  "concurrent_dials",
  "knowledge_rows",
  "intake_rpm",
  "simulation_minutes_daily",
];

/**
 * These dimensions are admitted before provider work and later released on a
 * definitive no-work outcome. They must never increment when the reservation
 * is denied. Actual completed voice usage is written separately through the
 * idempotent voice-usage event ledger.
 */
const CONDITIONAL_RESERVATION_DIMENSIONS = new Set<QuotaDimension>([
  "voice_minutes_daily",
  "simulation_minutes_daily",
]);

// ─────────────────────────────────────────────────────────────────
// Effective-limit resolution (pure)
// ─────────────────────────────────────────────────────────────────

export interface QuotaOverrideRow {
  user_id: string;
  dimension: QuotaDimension;
  value: number; // absolute cap; null/undefined → fall through to plan default
  enabled: boolean;
}

/**
 * Resolve the effective limit for one dimension.
 * Hard cap = min(plan_default, override) when override is set+enabled
 * and override < plan_default. An override that is *higher* than the
 * plan default is ALSO honored — account holders may grant a tenant extra
 * headroom temporarily.
 */
export function resolveLimit(
  plan: PlanTier,
  dimension: QuotaDimension,
  override?: { value: number; enabled: boolean } | null,
): number {
  const planDefault = PLAN_DEFAULTS[plan][dimension];
  if (override && override.enabled && Number.isFinite(override.value) && override.value >= 0) {
    return override.value;
  }
  return planDefault;
}

export function resolveProfile(plan: PlanTier, overrides: QuotaOverrideRow[]): QuotaProfile {
  const out: QuotaProfile = {
    ...PLAN_DEFAULTS[plan],
    voice_minutes_daily: voiceMinutesDailyQuotaForTier(plan),
  };
  for (const o of overrides) {
    if (!ALL_DIMENSIONS.includes(o.dimension)) continue;
    out[o.dimension] = resolveLimit(plan, o.dimension, { value: o.value, enabled: o.enabled });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Period-window helpers
// ─────────────────────────────────────────────────────────────────

/** UTC date stamp for daily counters: "YYYY-MM-DD". */
export function dailyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Minute-precision key for burst counters: "YYYY-MM-DDTHH:MM". */
export function minutePeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 16);
}

function nextDailyResetIso(now: Date = new Date()): string {
  const t = new Date(now);
  t.setUTCHours(24, 0, 0, 0);
  return t.toISOString();
}

function nextMinuteResetIso(now: Date = new Date()): string {
  const t = new Date(now);
  t.setUTCSeconds(60, 0);
  return t.toISOString();
}

function quotaWindow(dimension: QuotaDimension, now: Date = new Date()) {
  return dimension === "intake_rpm"
    ? { periodKey: minutePeriodKey(now), resetAt: nextMinuteResetIso(now) }
    : { periodKey: dailyPeriodKey(now), resetAt: nextDailyResetIso(now) };
}

function quotaUnits(delta: number): number {
  if (!Number.isSafeInteger(delta) || delta < 0) {
    throw new RangeError("Quota delta must be a non-negative safe integer.");
  }
  return delta;
}

// ─────────────────────────────────────────────────────────────────
// Decision shape
// ─────────────────────────────────────────────────────────────────

export interface QuotaDecision {
  allowed: boolean;
  dimension: QuotaDimension;
  limit: number;
  used: number;
  remaining: number;
  /** Period key for the dimension (daily or minute). */
  period_key: string;
  /** When the current window resets (ISO string). */
  reset_at: string;
  /**
   * True when Postgres authoritatively accepted or refused the operation. An
   * accepted reservation has a durable increment; an authoritative refusal
   * intentionally writes nothing. False means the write path failed and the
   * decision came from a read-only fallback. Spend-sensitive callers must
   * refuse on `!persisted` so accounting outages cannot create unmetered work.
   */
  persisted: boolean;
}

export function buildDecision(opts: {
  dimension: QuotaDimension;
  limit: number;
  used: number;
  delta: number;
  period_key: string;
  reset_at: string;
}): QuotaDecision {
  const projected = opts.used + opts.delta;
  const allowed = projected <= opts.limit;
  return {
    allowed,
    dimension: opts.dimension,
    limit: opts.limit,
    used: opts.used,
    remaining: Math.max(0, opts.limit - opts.used),
    period_key: opts.period_key,
    reset_at: opts.reset_at,
    // buildDecision is reached only after the atomic write path failed. The
    // read can guide availability-oriented callers but is not a reservation.
    persisted: false,
  };
}

function authoritativeDecision(opts: {
  allowed: boolean;
  dimension: QuotaDimension;
  limit: number;
  used: number;
  periodKey: string;
  resetAt: string;
}): QuotaDecision {
  return {
    allowed: opts.allowed,
    dimension: opts.dimension,
    limit: opts.limit,
    used: opts.used,
    remaining: Math.max(0, opts.limit - opts.used),
    period_key: opts.periodKey,
    reset_at: opts.resetAt,
    persisted: true,
  };
}

// ─────────────────────────────────────────────────────────────────
// DB-backed quota tracker
// ─────────────────────────────────────────────────────────────────

interface OverrideCacheEntry {
  rows: QuotaOverrideRow[];
  cached_at: number;
}

const OVERRIDE_CACHE_TTL_MS = 30_000;

export interface QuotaTrackerDeps {
  drizzle: VercelPgDatabase<typeof schema>;
  /** Resolves the plan tier for a user. */
  getPlanForUser: (userId: string) => Promise<PlanTier>;
}

export class QuotaTracker {
  private readonly overrideCache = new Map<string, OverrideCacheEntry>();
  constructor(private readonly deps: QuotaTrackerDeps) {}

  async getOverrides(userId: string, bypassCache = false): Promise<QuotaOverrideRow[]> {
    const cached = this.overrideCache.get(userId);
    if (!bypassCache && cached && Date.now() - cached.cached_at < OVERRIDE_CACHE_TTL_MS) {
      return cached.rows;
    }
    const data = await this.deps.drizzle
      .select({
        user_id: schema.quotaLimits.userId,
        dimension: schema.quotaLimits.dimension,
        value: schema.quotaLimits.value,
        enabled: schema.quotaLimits.enabled,
      })
      .from(schema.quotaLimits)
      .where(eq(schema.quotaLimits.userId, userId));

    const rows = (data || []).map((r: (typeof data)[number]) => ({
      ...r,
      dimension: r.dimension as QuotaDimension,
      value: Number(r.value),
      enabled: !!r.enabled,
    }));
    this.overrideCache.set(userId, { rows, cached_at: Date.now() });
    return rows;
  }

  /** Force-bust the override cache (e.g. after a PUT). */
  invalidate(userId: string): void {
    this.overrideCache.delete(userId);
  }

  async getProfile(
    userId: string,
    bypassOverrideCache = false,
  ): Promise<{ plan: PlanTier; profile: QuotaProfile }> {
    const [plan, overrides] = await Promise.all([
      this.deps.getPlanForUser(userId),
      this.getOverrides(userId, bypassOverrideCache),
    ]);
    return { plan, profile: resolveProfile(plan, overrides) };
  }

  private async getUsageForPeriod(
    userId: string,
    dimension: QuotaDimension,
    periodKey: string,
  ): Promise<number> {
    const [data] = await this.deps.drizzle
      .select({ used: schema.quotaUsage.used })
      .from(schema.quotaUsage)
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, dimension),
          eq(schema.quotaUsage.periodKey, periodKey),
        ),
      )
      .limit(1);
    return Number(data?.used ?? 0);
  }

  /** Read current usage without incrementing. */
  async getUsage(userId: string, dimension: QuotaDimension): Promise<number> {
    const { periodKey } = quotaWindow(dimension);
    return this.getUsageForPeriod(userId, dimension, periodKey);
  }

  /**
   * Record actual usage. Token accounting uses this after provider work and
   * must keep the real total even when it crosses the configured ceiling.
   *
   * Compatibility: voice/simulation callers historically used this method for
   * pre-provider admission. Those dimensions delegate to `tryReserve`, whose
   * conditional UPSERT refuses without incrementing when the cap is exhausted.
   */
  async checkAndIncrement(
    userId: string,
    dimension: QuotaDimension,
    delta = 1,
  ): Promise<QuotaDecision> {
    if (CONDITIONAL_RESERVATION_DIMENSIONS.has(dimension)) {
      return this.tryReserve(userId, dimension, delta);
    }

    const units = quotaUnits(delta);
    const { profile } = await this.getProfile(userId);
    const limit = Math.max(0, Math.floor(profile[dimension]));
    const { periodKey, resetAt } = quotaWindow(dimension);

    // Actual accounting is unconditional: once a provider has performed work,
    // the ledger must record it even when the call crosses a quota boundary.
    try {
      const [row] = (await this.deps.drizzle
        .insert(schema.quotaUsage)
        .values({
          userId,
          dimension,
          periodKey,
          used: BigInt(units),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.quotaUsage.userId,
            schema.quotaUsage.dimension,
            schema.quotaUsage.periodKey,
          ],
          set: {
            used: sql`${schema.quotaUsage.used} + ${BigInt(units)}`,
            updatedAt: new Date(),
          },
        })
        .returning()) as any[];

      const used = Number(row.used);
      return authoritativeDecision({
        allowed: used <= limit,
        dimension,
        limit,
        used,
        periodKey,
        resetAt,
      });
    } catch (error: any) {
      log.error("quota checkAndIncrement failed", { error: error.message, userId, dimension });
      const current = await this.getUsageForPeriod(userId, dimension, periodKey);
      return buildDecision({
        dimension,
        limit,
        used: current,
        delta: units,
        period_key: periodKey,
        reset_at: resetAt,
      });
    }
  }

  /**
   * Atomically reserve pre-provider quota without charging denied requests.
   *
   * PostgreSQL evaluates the conflict-update predicate while holding the row
   * lock. Concurrent reservations therefore serialize on the same tenant,
   * dimension, and period. A request that would exceed the limit returns no
   * row and leaves `used` unchanged. Fresh overrides are read for every
   * reservation so a recently lowered operator cap cannot remain stale in one
   * warm serverless invocation.
   */
  async tryReserve(
    userId: string,
    dimension: QuotaDimension,
    delta = 1,
  ): Promise<QuotaDecision> {
    const units = quotaUnits(delta);
    const { profile } = await this.getProfile(userId, true);
    const limit = Math.max(0, Math.floor(profile[dimension]));
    const { periodKey, resetAt } = quotaWindow(dimension);

    try {
      // An absent row would otherwise insert an impossible reservation, including
      // a 0-unit probe against a 0 cap (`0 > 0` is false). Refuse authoritatively
      // without a write before entering the UPSERT path.
      if (limit <= 0 || units > limit) {
        const current = await this.getUsageForPeriod(userId, dimension, periodKey);
        return authoritativeDecision({
          allowed: false,
          dimension,
          limit,
          used: current,
          periodKey,
          resetAt,
        });
      }

      const [row] = (await this.deps.drizzle
        .insert(schema.quotaUsage)
        .values({
          userId,
          dimension,
          periodKey,
          used: BigInt(units),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.quotaUsage.userId,
            schema.quotaUsage.dimension,
            schema.quotaUsage.periodKey,
          ],
          set: {
            used: sql`${schema.quotaUsage.used} + ${BigInt(units)}`,
            updatedAt: new Date(),
          },
          setWhere: sql`${schema.quotaUsage.used} + ${BigInt(units)} <= ${BigInt(limit)}`,
        })
        .returning()) as any[];

      if (row) {
        return authoritativeDecision({
          allowed: true,
          dimension,
          limit,
          used: Number(row.used),
          periodKey,
          resetAt,
        });
      }

      // The conditional conflict update refused the reservation. Re-read for
      // accurate headers, but never retry blindly: a concurrent release can
      // make this a conservative false-negative, which is safer than overspend.
      const current = await this.getUsageForPeriod(userId, dimension, periodKey);
      return authoritativeDecision({
        allowed: false,
        dimension,
        limit,
        used: current,
        periodKey,
        resetAt,
      });
    } catch (error: any) {
      log.error("quota tryReserve failed", { error: error.message, userId, dimension });
      const current = await this.getUsageForPeriod(userId, dimension, periodKey);
      return buildDecision({
        dimension,
        limit,
        used: current,
        delta: units,
        period_key: periodKey,
        reset_at: resetAt,
      });
    }
  }

  /**
   * Return a previously persisted quota reservation after a provider refuses
   * work before a usable session exists. The update is atomic and floor-bounded
   * so duplicate cleanup can never mint allowance.
   */
  async releaseUsage(
    userId: string,
    dimension: QuotaDimension,
    delta: number,
    periodKey?: string,
  ): Promise<void> {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const reservedPeriodKey =
      periodKey || (dimension === "intake_rpm" ? minutePeriodKey() : dailyPeriodKey());
    await this.deps.drizzle
      .update(schema.quotaUsage)
      .set({
        used: sql`greatest(${schema.quotaUsage.used} - ${BigInt(Math.floor(delta))}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, dimension),
          eq(schema.quotaUsage.periodKey, reservedPeriodKey),
        ),
      );
  }
}

// ─────────────────────────────────────────────────────────────────
// Override validation (used by PUT endpoint)
// ─────────────────────────────────────────────────────────────────

export interface OverrideRequest {
  dimension: string;
  value: number;
  enabled: boolean;
}

export function validateOverride(
  req: unknown,
): { ok: true; value: OverrideRequest } | { ok: false; error: string } {
  if (!req || typeof req !== "object") return { ok: false, error: "body must be an object" };
  const r = req as Record<string, unknown>;
  if (typeof r.dimension !== "string" || !ALL_DIMENSIONS.includes(r.dimension as QuotaDimension)) {
    return { ok: false, error: `dimension must be one of: ${ALL_DIMENSIONS.join(", ")}` };
  }
  if (typeof r.value !== "number" || !Number.isFinite(r.value) || r.value < 0 || r.value > 1e12) {
    return { ok: false, error: "value must be a non-negative finite number ≤ 1e12" };
  }
  if (typeof r.enabled !== "boolean") {
    return { ok: false, error: "enabled must be boolean" };
  }
  return { ok: true, value: { dimension: r.dimension, value: r.value, enabled: r.enabled } };
}

/**
 * Convenience: HTTP status + headers to emit on a 429-like quota refusal.
 * Caller layers on JSON body details.
 */
export function quotaRejectionHeaders(d: QuotaDecision): Record<string, string> {
  const retryAfter = Math.max(1, Math.ceil((Date.parse(d.reset_at) - Date.now()) / 1000));
  return {
    "Retry-After": String(retryAfter),
    "X-RateLimit-Limit": String(d.limit),
    "X-RateLimit-Used": String(d.used),
    "X-RateLimit-Remaining": String(d.remaining),
    "X-RateLimit-Reset": d.reset_at,
    "X-Quota-Dimension": d.dimension,
  };
}
