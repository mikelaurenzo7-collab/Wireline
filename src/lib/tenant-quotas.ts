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
   * False when the increment could not be durably recorded and the decision
   * came from the read-only fallback. During a write-degraded incident the
   * fallback keeps allowing until *recorded* usage reaches the limit, so
   * spend-sensitive callers (vendor-metered session mints) must refuse on
   * `!persisted` — otherwise unmetered spend continues exactly while
   * accounting is blind. Availability-oriented dimensions may accept it.
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
    // buildDecision is only reached from read-only paths (the fallback after
    // a failed increment, and plain usage reads) — nothing was written.
    persisted: false,
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

export interface QuotaTrackerDeps {
  drizzle: VercelPgDatabase<typeof schema>;
  /** Resolves the plan tier for a user. */
  getPlanForUser: (userId: string) => Promise<PlanTier>;
}

export class QuotaTracker {
  private readonly overrideCache = new Map<string, OverrideCacheEntry>();
  constructor(private readonly deps: QuotaTrackerDeps) {}

  async getOverrides(userId: string): Promise<QuotaOverrideRow[]> {
    const cached = this.overrideCache.get(userId);
    if (cached && Date.now() - cached.cached_at < OVERRIDE_CACHE_TTL_MS) {
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

  async getProfile(userId: string): Promise<{ plan: PlanTier; profile: QuotaProfile }> {
    const [plan, overrides] = await Promise.all([
      this.deps.getPlanForUser(userId),
      this.getOverrides(userId),
    ]);
    return { plan, profile: resolveProfile(plan, overrides) };
  }

  /** Read current usage without incrementing. */
  async getUsage(userId: string, dimension: QuotaDimension): Promise<number> {
    const periodKey = dimension === "intake_rpm" ? minutePeriodKey() : dailyPeriodKey();
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

  /**
   * Check + reserve `delta` units against the dimension via an atomic
   * ON CONFLICT upsert, with a non-atomic select fallback when the upsert
   * errors. NOTE: despite the historical claim, this is NOT fail-open — the
   * fallback re-queries the same database (getUsage rethrows when it's truly
   * down) and getProfile runs outside any try at all, so callers see an
   * exception when the counter store is unavailable. Callers that want
   * fail-open must catch and decide themselves (api-rate-limits.ts does).
   */
  async checkAndIncrement(
    userId: string,
    dimension: QuotaDimension,
    delta = 1,
  ): Promise<QuotaDecision> {
    const { profile } = await this.getProfile(userId);
    const limit = profile[dimension];
    const periodKey = dimension === "intake_rpm" ? minutePeriodKey() : dailyPeriodKey();
    const resetAt = dimension === "intake_rpm" ? nextMinuteResetIso() : nextDailyResetIso();

    // Atomic increment using ON CONFLICT ... UPDATE
    try {
      const [row] = (await this.deps.drizzle
        .insert(schema.quotaUsage)
        .values({
          userId,
          dimension,
          periodKey,
          used: BigInt(delta),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.quotaUsage.userId,
            schema.quotaUsage.dimension,
            schema.quotaUsage.periodKey,
          ],
          set: {
            used: sql`${schema.quotaUsage.used} + ${BigInt(delta)}`,
            updatedAt: new Date(),
          },
        })
        .returning()) as any[];

      const used = Number(row.used);
      const allowed = used <= limit;

      return {
        allowed,
        dimension,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        period_key: periodKey,
        reset_at: resetAt,
        persisted: true,
      };
    } catch (error: any) {
      log.error("quota checkAndIncrement failed", { error: error.message, userId, dimension });
      // Non-atomic fallback: select → if would-exceed, refuse without writing.
      const current = await this.getUsage(userId, dimension);
      return buildDecision({
        dimension,
        limit,
        used: current,
        delta,
        period_key: periodKey,
        reset_at: resetAt,
      });
    }
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
