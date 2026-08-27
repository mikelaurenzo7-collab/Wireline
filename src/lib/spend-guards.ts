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
import { resolveAiDailySpendAlertUsd } from "./ai-spend-alert";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";

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

/**
 * Admission decisions that can create provider spend must read the persisted
 * budget and month-to-date ledger on every attempt. The one-minute cache is a
 * dashboard/notification optimization only; under serverless concurrency a
 * cached allowance from another invocation can otherwise admit work after the
 * hard cap has already been crossed.
 */
function getAuthoritativeBudgetSnapshot(userId: string): Promise<BudgetSnapshot> {
  return getBudgetSnapshot(userId, true);
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
      let claimed: { id: bigint } | undefined;
      try {
        [claimed] = await drizzle
          .insert(schema.spendAlerts)
          .values({ userId, period: snap.period, thresholdPct: threshold.pct })
          .onConflictDoNothing()
          .returning({ id: schema.spendAlerts.id });
      } catch {
        continue;
      }
      if (!claimed) continue;

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
  const snap = await getAuthoritativeBudgetSnapshot(userId);
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
      "BotBound could not verify your spend guard. New live work is paused until the check recovers.",
  });
}

export async function enforceSpendCap(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) return next();

  // This middleware is the common admission boundary for customer-triggered
  // provider spend. Only a workspace explicitly classified as production may
  // reach the budget check and, eventually, a paid provider. Keep the account
  // environment lookup outside the spend-budget catch below so its specific
  // 403/503 AppError is preserved instead of being flattened into a generic
  // spend-guard outage.
  await assertLiveExternalActionAllowed(userId, "provider_spend_admission");

  try {
    const snap = await getAuthoritativeBudgetSnapshot(userId);
    const status = resolveHardSpendCapStatus(snap);
    if (status === "unavailable") {
      log.error("enforceSpendCap found missing or invalid budget", { userId });
      return sendSpendGuardUnavailable(res);
    }
    if (status === "disabled" || status === "within_limit") return next();

    return res.status(402).json({
      code: "SPEND_CAP_REACHED",
      error:
        "Your provider spend guard has reached its plan-funded limit. New live work resumes next monthly period; review Billing if you need more capacity now.",
      recovery_path: "/settings/billing",
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

const AI_DAILY_ALERT_USD = resolveAiDailySpendAlertUsd();

/** @deprecated Blocking removed — kept for tests/metrics that referenced the old 1% valve. */
export const DAILY_SPEND_LIMIT_USD = 0;

export function recordDailySpend(usd: number): void {
  void recordDailySpendUsd(usd)
    .then(() => getDailySpendUsd())
    .then((accumulated) => {
      if (AI_DAILY_ALERT_USD > 0 && accumulated >= AI_DAILY_ALERT_USD) {
        log.warn("Daily AI spend alert threshold crossed (telemetry only)", {
          alert_threshold_usd: AI_DAILY_ALERT_USD,
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
