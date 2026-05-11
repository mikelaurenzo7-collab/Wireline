/**
 * src/lib/spend-guards.ts
 *
 * Express middleware that enforces per-user monthly and system-wide
 * 24-hour Claude spend caps. Extracted from server.ts so route files
 * can import these without creating a circular dependency.
 *
 * Per-user monthly hard-cap (enforceSpendCap) reads from the DB;
 * system-wide 24h cap (enforce24hSpendCap) uses an in-process accumulator.
 */

import { db, log } from "./server-context";

// ──────────────────────────────────────────────────────────────────────
//  PER-USER monthly hard-cap
// ──────────────────────────────────────────────────────────────────────

interface BudgetRow {
  monthly_limit_usd: number;
  hard_cap: boolean;
  warn_threshold_pct: number;
  enabled: boolean;
}

interface BudgetSnapshot {
  budget: BudgetRow | null;
  mtdCost: number;
  period: string;
}

interface BudgetCacheEntry {
  fetchedAt: number;
  budget: BudgetRow | null;
  mtdCost: number;
  period: string;
}

const budgetCache = new Map<string, BudgetCacheEntry>();
const BUDGET_CACHE_TTL_MS = 60 * 1000; // 1 minute is plenty for the hot path

function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

function periodStartIso(period: string): string {
  return `${period}-01T00:00:00.000Z`;
}

export function clearBudgetCache(userId: string) {
  budgetCache.delete(userId);
}

export async function getBudgetSnapshot(userId: string, bypassCache: boolean = false): Promise<BudgetSnapshot> {
  const period = currentPeriod();
  const cached = budgetCache.get(userId);
  if (!bypassCache && cached && cached.period === period && Date.now() - cached.fetchedAt < BUDGET_CACHE_TTL_MS) {
    return cached;
  }

  const [{ data: budget }, { data: rows }] = await Promise.all([
    db.from("wireline_spend_budgets")
      .select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("wireline_audit_log")
      .select("cost_usd")
      .eq("user_id", userId)
      .gte("created_at", periodStartIso(period)),
  ]);

  const mtdCost = (rows || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
  const entry: BudgetCacheEntry = {
    fetchedAt: Date.now(),
    budget: budget
      ? {
          monthly_limit_usd: Number(budget.monthly_limit_usd || 0),
          hard_cap: !!budget.hard_cap,
          warn_threshold_pct: Number(budget.warn_threshold_pct || 80),
          enabled: budget.enabled !== false,
        }
      : null,
    mtdCost,
    period,
  };
  budgetCache.set(userId, entry);
  return entry;
}

function bumpBudgetCache(userId: string, deltaUsd: number) {
  const cached = budgetCache.get(userId);
  if (!cached) return;
  const period = currentPeriod();
  if (cached.period !== period) return;
  cached.mtdCost += deltaUsd;
}

import { dispatchWebhook, type WebhookEvent } from "./webhook-helpers";
import { SentryEvents } from "./sentry-events";

/**
 * Fire spend.warning / spend.exceeded webhooks when thresholds cross.
 * Debounced via wireline_spend_alerts(unique user_id+period+threshold) —
 * each threshold fires at most once per period.
 */
export async function evaluateSpend(userId: string, deltaUsd: number) {
  try {
    bumpBudgetCache(userId, deltaUsd);
    const snap = await getBudgetSnapshot(userId);
    if (!snap.budget || !snap.budget.enabled) return;
    const limit = snap.budget.monthly_limit_usd;
    if (!(limit > 0)) return;

    const pct = (snap.mtdCost / limit) * 100;
    const warnPct = Math.max(1, Math.min(99, snap.budget.warn_threshold_pct));
    const thresholdsToFire: { pct: number; event: WebhookEvent }[] = [];
    if (pct >= 100) thresholdsToFire.push({ pct: 100, event: "spend.exceeded" });
    if (pct >= warnPct) thresholdsToFire.push({ pct: warnPct, event: "spend.warning" });

    for (const t of thresholdsToFire) {
      // Debounce: insert (user, period, threshold) — duplicate row => already fired.
      const { error } = await db
        .from("wireline_spend_alerts")
        .insert({ user_id: userId, period: snap.period, threshold_pct: t.pct });
      if (error) continue; // unique-violation or insert error → skip silently
      await dispatchWebhook(userId, t.event, {
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: limit,
        threshold_pct: t.pct,
        percent_used: Number(pct.toFixed(1)),
        hard_cap: snap.budget.hard_cap,
        at: new Date().toISOString(),
      });

      // Track budget thresholds in Sentry
      if (t.event === "spend.exceeded") {
        SentryEvents.budgetExceeded({
          user_id: userId,
          spent: Number(snap.mtdCost.toFixed(4)),
          budget: limit,
        });
      }
    }
  } catch (err) {
    log.error("evaluateSpend failed", { error: (err as any)?.message });
  }
}

/**
 * Express middleware — blocks Claude endpoints when the operator has
 * enabled a monthly hard cap and the current month-to-date spend has
 * reached it. Fails OPEN on DB errors to avoid locking out everyone
 * when Supabase has a transient issue.
 */
export async function enforceSpendCap(req: any, res: any, next: any) {
  if (!req?.user?.id) return next();
  try {
    const snap = await getBudgetSnapshot(req.user.id);
    const b = snap.budget;
    if (b && b.enabled && b.hard_cap && b.monthly_limit_usd > 0 && snap.mtdCost >= b.monthly_limit_usd) {
      return res.status(402).json({
        error: `Monthly Claude budget reached ($${b.monthly_limit_usd.toFixed(2)}). Disable hard cap or raise the limit in Insights → AI Spend.`,
        code: "SPEND_LIMIT_EXCEEDED",
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: b.monthly_limit_usd,
      });
    }
  } catch (err) {
    log.warn("enforceSpendCap check failed — allowing request through", {
      user_id: req?.user?.id,
      requestId: res.locals?.requestId,
      error: (err as any)?.message || String(err),
    });
  }
  next();
}

// ──────────────────────────────────────────────────────────────────────
//  SYSTEM-WIDE 24-hour accumulator cap
// ──────────────────────────────────────────────────────────────────────

const CLAUDE_MONTHLY_BUDGET_USD = Math.max(0, Number(process.env.CLAUDE_MONTHLY_BUDGET_USD ?? 50));
export const DAILY_SPEND_LIMIT_USD = CLAUDE_MONTHLY_BUDGET_USD * 0.01; // 1% of monthly

// In-process accumulator — intentionally resets on cold start.
// For stronger guarantees use Upstash Redis as the rate-limit store.
let _dailySpendWindowStart = Date.now();
let _dailySpendAccumUsd = 0;

/**
 * Call this after every Claude API round trip to track cumulative 24h spend.
 */
export function recordDailySpend(usd: number) {
  const now = Date.now();
  if (now - _dailySpendWindowStart > 24 * 60 * 60_000) {
    _dailySpendWindowStart = now;
    _dailySpendAccumUsd = 0;
  }
  _dailySpendAccumUsd += usd;
  if (DAILY_SPEND_LIMIT_USD > 0 && _dailySpendAccumUsd >= DAILY_SPEND_LIMIT_USD) {
    log.warn("Daily Claude spend cap reached", {
      daily_limit_usd: DAILY_SPEND_LIMIT_USD,
      accumulated_usd: Number(_dailySpendAccumUsd.toFixed(4)),
      monthly_budget_usd: CLAUDE_MONTHLY_BUDGET_USD,
    });
  }
}

/**
 * Express pre-handler — blocks Claude endpoints when the 24h spend window
 * is over budget. Disabled when CLAUDE_MONTHLY_BUDGET_USD is 0.
 */
export function enforce24hSpendCap(req: any, res: any, next: any) {
  if (DAILY_SPEND_LIMIT_USD <= 0) return next(); // disabled when budget is 0
  const now = Date.now();
  if (now - _dailySpendWindowStart > 24 * 60 * 60_000) {
    _dailySpendWindowStart = now;
    _dailySpendAccumUsd = 0;
  }
  if (_dailySpendAccumUsd >= DAILY_SPEND_LIMIT_USD) {
    return res.status(402).json({
      error: `Daily Claude spend limit reached ($${DAILY_SPEND_LIMIT_USD.toFixed(2)}/day, 1 % of $${CLAUDE_MONTHLY_BUDGET_USD} monthly budget). Resets in ${Math.ceil((24 * 60 * 60_000 - (now - _dailySpendWindowStart)) / 60_000)} minutes.`,
      code: "DAILY_SPEND_LIMIT_EXCEEDED",
      daily_limit_usd: DAILY_SPEND_LIMIT_USD,
      accumulated_usd: Number(_dailySpendAccumUsd.toFixed(4)),
    });
  }
  next();
}
