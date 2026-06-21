/**
 * src/lib/spend-guards.ts
 *
 * Claude spend tracking + budget webhooks. Request blocking caps were removed —
 * tenant overages are billed via Stripe (voice minutes, add-ons). Middleware
 * here is a no-op pass-through; evaluateSpend still fires warn/exceeded webhooks.
 */

import type { Request, Response, NextFunction } from "express";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { recordDailySpendUsd, getDailySpendUsd } from "./daily-spend-accumulator";
import { getErrorMessage } from "./server-utils";

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

function periodStartIso(period: string): Date {
  return new Date(`${period}-01T00:00:00.000Z`);
}

export function clearBudgetCache(userId: string) {
  budgetCache.delete(userId);
}

export async function getBudgetSnapshot(
  userId: string,
  bypassCache: boolean = false,
): Promise<BudgetSnapshot> {
  const period = currentPeriod();
  const cached = budgetCache.get(userId);
  if (
    !bypassCache &&
    cached &&
    cached.period === period &&
    Date.now() - cached.fetchedAt < BUDGET_CACHE_TTL_MS
  ) {
    return cached;
  }

  const [budgetRow, mtdRow] = await Promise.all([
    drizzle
      .select({
        monthlyLimitUsd: schema.spendBudgets.monthlyLimitUsd,
        hardCap: schema.spendBudgets.hardCap,
        warnThresholdPct: schema.spendBudgets.warnThresholdPct,
        enabled: schema.spendBudgets.enabled,
      })
      .from(schema.spendBudgets)
      .where(eq(schema.spendBudgets.userId, userId))
      .limit(1)
      .then((rows) => rows[0] || null),

    drizzle
      .select({
        mtdCost: sql<string>`coalesce(sum(${schema.auditLog.costUsd}), 0)`.mapWith(String),
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          gte(schema.auditLog.createdAt, periodStartIso(period)),
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const mtdCost = Number(mtdRow?.mtdCost ?? 0);
  const entry: BudgetCacheEntry = {
    fetchedAt: Date.now(),
    budget: budgetRow
      ? {
          monthly_limit_usd: Number(budgetRow.monthlyLimitUsd || 0),
          hard_cap: !!budgetRow.hardCap,
          warn_threshold_pct: Number(budgetRow.warnThresholdPct || 80),
          enabled: budgetRow.enabled !== false,
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
    const mtdCostUsd = Number(snap.mtdCost.toFixed(4));
    const warnPct = Math.max(1, Math.min(99, snap.budget.warn_threshold_pct));
    const thresholdsToFire: { pct: number; event: WebhookEvent }[] = [];
    if (pct >= 100) thresholdsToFire.push({ pct: 100, event: "spend.exceeded" });
    if (pct >= warnPct) thresholdsToFire.push({ pct: warnPct, event: "spend.warning" });

    for (const t of thresholdsToFire) {
      // Debounce: insert (user, period, threshold) — duplicate row => already fired.
      try {
        await drizzle
          .insert(schema.spendAlerts)
          .values({ userId: userId, period: snap.period, thresholdPct: t.pct });
      } catch {
        // unique-violation or insert error → skip silently
        continue;
      }

      await dispatchWebhook(userId, t.event, {
        period: snap.period,
        month_to_date_usd: mtdCostUsd,
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
          spent: mtdCostUsd,
          budget: limit,
        });
      }
    }
  } catch (err) {
    log.error("evaluateSpend failed", { error: getErrorMessage(err) });
  }
}

type AuthedRequest = Request & { user?: { id?: string } };

/** Legacy mount point — spend is never blocked; overages bill through Stripe. */
export async function enforceSpendCap(_req: AuthedRequest, _res: Response, next: NextFunction) {
  next();
}

/** True when a tenant has enabled hard_cap and month-to-date spend meets/exceeds limit. */
export async function isHardSpendCapExceeded(userId: string): Promise<boolean> {
  const snap = await getBudgetSnapshot(userId);
  if (!snap.budget?.enabled || !snap.budget.hard_cap) return false;
  const limit = snap.budget.monthly_limit_usd;
  if (!(limit > 0)) return false;
  return snap.mtdCost >= limit;
}

// ──────────────────────────────────────────────────────────────────────
//  SYSTEM-WIDE 24-hour accumulator cap
// ──────────────────────────────────────────────────────────────────────

/** Ops telemetry only — optional alert threshold (USD / rolling 24h). Not enforced. */
const CLAUDE_DAILY_ALERT_USD = Math.max(
  0,
  Number(process.env.CLAUDE_DAILY_ALERT_USD ?? process.env.CLAUDE_MONTHLY_BUDGET_USD ?? 0) * 0.01,
);

/** @deprecated Blocking removed — kept for tests/metrics that referenced the old 1% valve. */
export const DAILY_SPEND_LIMIT_USD = 0;

/**
 * Call this after every Claude API round trip to track cumulative 24h spend.
 */
export function recordDailySpend(usd: number): void {
  void recordDailySpendUsd(usd)
    .then(() => getDailySpendUsd())
    .then((accumulated) => {
      if (CLAUDE_DAILY_ALERT_USD > 0 && accumulated >= CLAUDE_DAILY_ALERT_USD) {
        log.warn("Daily Claude spend alert threshold crossed (telemetry only)", {
          alert_threshold_usd: CLAUDE_DAILY_ALERT_USD,
          accumulated_usd: Number(accumulated.toFixed(4)),
        });
      }
    })
    .catch(() => {
      /* telemetry only — never surface a rejection */
    });
}

/** Legacy mount point — Assistants-wide daily cap removed; usage bills per tenant. */
export async function enforce24hSpendCap(_req: Request, _res: Response, next: NextFunction) {
  next();
}
