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

import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// Plan defaults
// ─────────────────────────────────────────────────────────────────

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface QuotaProfile {
  /** Anthropic input+output tokens per UTC day. */
  claude_tokens_daily: number;
  /** Sum of voice-call duration in minutes per UTC day. */
  voice_minutes_daily: number;
  /** Concurrent in-flight outbound dials per tenant. */
  concurrent_dials: number;
  /** Knowledge-base storage rows per tenant. */
  knowledge_rows: number;
  /** Lead-intake API requests per minute per tenant. */
  intake_rpm: number;
}

export const PLAN_DEFAULTS: Record<PlanTier, QuotaProfile> = {
  free: {
    claude_tokens_daily: 200_000,
    voice_minutes_daily: 60,
    concurrent_dials: 1,
    knowledge_rows: 200,
    intake_rpm: 10,
  },
  starter: {
    claude_tokens_daily: 1_500_000,
    voice_minutes_daily: 600,
    concurrent_dials: 5,
    knowledge_rows: 2_000,
    intake_rpm: 60,
  },
  pro: {
    claude_tokens_daily: 8_000_000,
    voice_minutes_daily: 4_000,
    concurrent_dials: 25,
    knowledge_rows: 20_000,
    intake_rpm: 240,
  },
  enterprise: {
    claude_tokens_daily: 50_000_000,
    voice_minutes_daily: 50_000,
    concurrent_dials: 250,
    knowledge_rows: 250_000,
    intake_rpm: 1_200,
  },
};

export type QuotaDimension = keyof QuotaProfile;

export const ALL_DIMENSIONS: QuotaDimension[] = [
  "claude_tokens_daily",
  "voice_minutes_daily",
  "concurrent_dials",
  "knowledge_rows",
  "intake_rpm",
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
 * plan default is ALSO honored — operators may grant a tenant extra
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

export function resolveProfile(
  plan: PlanTier,
  overrides: QuotaOverrideRow[],
): QuotaProfile {
  const out: QuotaProfile = { ...PLAN_DEFAULTS[plan] };
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
const overrideCache = new Map<string, OverrideCacheEntry>();

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
  db: SupabaseClient;
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
    const { data } = await this.deps.db
      .from("wireline_quota_limits")
      .select("user_id, dimension, value, enabled")
      .eq("user_id", userId);
    const rows = (data || []) as QuotaOverrideRow[];
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
    const periodKey =
      dimension === "intake_rpm" ? minutePeriodKey() : dailyPeriodKey();
    const { data } = await this.deps.db
      .from("wireline_quota_usage")
      .select("used")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .eq("period_key", periodKey)
      .maybeSingle();
    return Number((data as { used?: number } | null)?.used ?? 0);
  }

  /**
   * Check + reserve `delta` units against the dimension. Atomic upsert
   * via Postgres RPC (`wireline_quota_increment`); falls back to a
   * non-atomic select/update path when the RPC isn't installed yet
   * (older deployments). Fail-OPEN on DB errors so we never lock out
   * legitimate traffic when the counter store is degraded.
   */
  async checkAndIncrement(
    userId: string,
    dimension: QuotaDimension,
    delta = 1,
  ): Promise<QuotaDecision> {
    const { profile } = await this.getProfile(userId);
    const limit = profile[dimension];
    const periodKey =
      dimension === "intake_rpm" ? minutePeriodKey() : dailyPeriodKey();
    const resetAt =
      dimension === "intake_rpm" ? nextMinuteResetIso() : nextDailyResetIso();

    // Try atomic RPC first
    try {
      const { data, error } = await this.deps.db.rpc("wireline_quota_increment", {
        p_user_id: userId,
        p_dimension: dimension,
        p_period_key: periodKey,
        p_delta: delta,
        p_limit: limit,
      });
      if (!error && data !== null && typeof data === "object") {
        const row = data as { used: number; allowed: boolean };
        return {
          allowed: row.allowed,
          dimension,
          limit,
          used: row.used,
          remaining: Math.max(0, limit - row.used),
          period_key: periodKey,
          reset_at: resetAt,
        };
      }
    } catch {
      // Fall through to non-atomic path.
    }

    // Non-atomic fallback: select → if would-exceed, refuse without writing.
    const current = await this.getUsage(userId, dimension);
    if (current + delta > limit) {
      return buildDecision({ dimension, limit, used: current, delta, period_key: periodKey, reset_at: resetAt });
    }
    await this.deps.db.from("wireline_quota_usage").upsert(
      {
        user_id: userId,
        dimension,
        period_key: periodKey,
        used: current + delta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,dimension,period_key" },
    );
    return buildDecision({ dimension, limit, used: current + delta, delta: 0, period_key: periodKey, reset_at: resetAt });
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

export function validateOverride(req: unknown): { ok: true; value: OverrideRequest } | { ok: false; error: string } {
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
