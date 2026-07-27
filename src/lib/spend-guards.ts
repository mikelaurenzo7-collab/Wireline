/**
 * src/lib/spend-guards.ts
 *
 * Per-user spend tracking, customer-selected hard caps, and spend webhooks.
 * A hard cap is enforced before new outbound voice work begins; it deliberately
 * does not terminate an in-flight conversation mid-sentence.
 */

import type { Request, Response, NextFunction } from "express";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { recordDailySpendUsd, getDailySpendUsd } from "./daily-spend-accumulator";
import { getErrorMessage } from "./server-utils";
import { resolveHardSpendCapStatus } from "./spend-budget-policy";

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
const BUDGET_CACHE_TTL_MS = 60 * 1000;

function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
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
  if (!cached || cached.period !== currentPeriod()) return;
  cached.mtdCost += deltaUsd;
}

import { dispatchWebhook, type WebhookEvent } from "./webhook-helpers";
import { SentryEvents } from "./sentry-events";

/** Fire spend.warning / spend.exceeded webhooks when thresholds cross. */
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

    for (const threshold of thresholdsToFire) {
      try {
        await drizzle
          .insert(schema.spendAlerts)
          .values({ userId, period: snap.period, thresholdPct: threshold.pct });
      } catch {
        continue;
      }

      await dispatchWebhook(userId, threshold.event, {
        period: snap.period,
        month_to_date_usd: mtdCostUsd,
        monthly_limit_usd: limit,
        threshold_pct: threshold.pct,
        percent_used: Number(pct.toFixed(1)),
        hard_cap: snap.budget.hard_cap,
        at: new Date().toISOString(),
      });

      if (threshold.event === "spend.exceeded") {
        SentryEvents.budgetExceeded({ user_id: userId, spent: mtdCostUsd, budget: limit });
      }
    }
  } catch (err) {
    log.error("evaluateSpend failed", { error: getErrorMessage(err) });
  }
}

type AuthedRequest = Request & { user?: { id?: string } };

/** True when a tenant has enabled hard_cap and month-to-date spend meets/exceeds limit. */
export async function isHardSpendCapExceeded(userId: string): Promise<boolean> {
  const snap = await getBudgetSnapshot(userId);
  const status = resolveHardSpendCapStatus(snap);
  if (status === "unavailable") {
    throw new Error("Spend budget is missing or invalid.");
  }
  return status === "exceeded";
}

function sendSpendGuardUnavailable(res: Response) {
  return res.status(503).json({
    code: "SPEND_GUARD_UNAVAILABLE",
    error:
      "Wireline could not verify your spend guard. New live work is paused until the check recovers.",
  });
}

/**
 * Cost-sensitive routes call this before starting new work. The guard stops a
 * new outbound task once an account holder's chosen cap is exhausted. It does
 * not interrupt an active conversation; stopping mid-call would create a worse
 * customer outcome and an unpredictable partial task.
 */
export async function enforceSpendCap(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) return next();

  try {
    const snap = await getBudgetSnapshot(userId);
    const status = resolveHardSpendCapStatus(snap);
    if (status === "unavailable") {
      log.error("enforceSpendCap found missing or invalid budget", { userId });
      return sendSpendGuardUnavailable(res);
    }
    if (status === "disabled" || status === "within_limit") return next();

    return res.status(402).json({
      code: "SPEND_CAP_REACHED",
      error:
        "Your monthly hard cap has been reached. Increase or disable the cap to start new live work.",
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: snap.budget!.monthly_limit_usd,
      hard_cap: true,
    });
  } catch (err) {
    log.error("enforceSpendCap could not verify budget", { userId, error: getErrorMessage(err) });
    return sendSpendGuardUnavailable(res);
  }
}

/** Ops telemetry only — optional alert threshold (USD / rolling 24h). */
const CLAUDE_DAILY_ALERT_USD = Math.max(
  0,
  Number(process.env.CLAUDE_DAILY_ALERT_USD ?? process.env.CLAUDE_MONTHLY_BUDGET_USD ?? 0) * 0.01,
);

/** @deprecated Blocking removed — kept for tests/metrics that referenced the old 1% valve. */
export const DAILY_SPEND_LIMIT_USD = 0;

/** Call this after every Claude API round trip to track cumulative 24h spend. */
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
      /* telemetry only */
    });
}

/** Legacy mount point — Assistants-wide daily cap remains telemetry-only. */
export async function enforce24hSpendCap(_req: Request, _res: Response, next: NextFunction) {
  next();
}
