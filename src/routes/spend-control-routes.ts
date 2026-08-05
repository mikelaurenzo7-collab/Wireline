import express, { Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { validateBody, spendBudgetSchema } from "../lib/api-validation";
import { clearBudgetCache, getBudgetSnapshot, isHardSpendCapExceeded } from "../lib/spend-guards";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import {
  defaultAiSpendBudgetUsdForTier,
  getEffectiveSubscriptionPlanId,
  subscriptionPlanToTier,
} from "../lib/plan-entitlements";
import { planById } from "../lib/plan-catalog";

const router = express.Router();

type PersistedSpendBudget = typeof schema.spendBudgets.$inferSelect;
type SpendGuardScope = "plan_funded" | "free_builder_emergency";

type PersistedSpendBudgetContext = {
  budget: PersistedSpendBudget;
  maximumLimitUsd: number;
  planId: string | null;
  planName: string;
  providerWorkEnabled: boolean;
  guardScope: SpendGuardScope;
};

async function readPersistedSpendBudget(userId: string): Promise<PersistedSpendBudget | null> {
  const [budget] = await drizzle
    .select()
    .from(schema.spendBudgets)
    .where(eq(schema.spendBudgets.userId, userId))
    .limit(1);
  return budget ?? null;
}

/**
 * Repair legacy/demo accounts that predate spend-budget seeding. Runtime
 * provider work still fails closed independently; this read path restores the
 * plan default so the Account Holder can view and edit a real persisted guard.
 *
 * Free Builder keeps a small internal emergency circuit breaker for defense in
 * depth, but it is not a customer allowance and is not editable. Paid plans
 * expose their catalog-funded provider envelope. An unknown active plan fails
 * closed instead of silently inheriting the Free Builder fallback.
 */
async function ensurePersistedSpendBudget(
  userId: string,
  email?: string | null,
): Promise<PersistedSpendBudgetContext> {
  const planId = await getEffectiveSubscriptionPlanId(userId, email);
  const resolvedPlan = planById(planId);
  const tier = subscriptionPlanToTier(planId);
  const isKnownFreeBuilder = !planId || resolvedPlan?.id === "personal";

  if (planId && tier === "free" && !isKnownFreeBuilder) {
    log.error("Spend guard could not resolve active plan", { userId, planId });
    throw AppError.fromHttpStatus(
      503,
      "Wireline could not resolve the active plan for provider spend controls.",
    );
  }

  const providerWorkEnabled = tier !== "free";
  const maximumLimitUsd = providerWorkEnabled ? defaultAiSpendBudgetUsdForTier(tier) : 0;
  const planName =
    resolvedPlan?.name ?? (providerWorkEnabled ? "Wireline Business" : "Wireline Free Builder");
  const guardScope: SpendGuardScope = providerWorkEnabled
    ? "plan_funded"
    : "free_builder_emergency";

  const { ensureDefaultAiSpendBudget } = await import("../lib/workspace-usage-snapshot");
  await ensureDefaultAiSpendBudget(userId, planId);
  clearBudgetCache(userId);

  const budget = await readPersistedSpendBudget(userId);
  if (!budget) {
    throw AppError.fromHttpStatus(503, "Spend guard is temporarily unavailable.");
  }
  return {
    budget,
    maximumLimitUsd,
    planId,
    planName,
    providerWorkEnabled,
    guardScope,
  };
}

/**
 * This router intentionally mounts before the legacy billing router. It keeps
 * the request shape compatible while making a user-selected hard cap real for
 * new outbound work instead of silently coercing it to false.
 */
router.get(
  "/api/spend/budget",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = await ensurePersistedSpendBudget(req.user.id, req.user.email);
      const { budget, maximumLimitUsd, planId, planName, providerWorkEnabled, guardScope } =
        context;
      res.json({
        budget: {
          monthly_limit_usd: providerWorkEnabled ? budget.monthlyLimitUsd : null,
          maximum_limit_usd: maximumLimitUsd,
          hard_cap: providerWorkEnabled ? budget.hardCap : true,
          warn_threshold_pct: budget.warnThresholdPct,
          enabled: providerWorkEnabled ? budget.enabled : false,
          updated_at: budget.updatedAt,
          plan_id: planId,
          plan_name: planName,
          provider_work_enabled: providerWorkEnabled,
          customer_editable: providerWorkEnabled,
          guard_scope: guardScope,
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Failed to load spend budget", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load budget");
    }
  },
);

router.put(
  "/api/spend/budget",
  authenticateUser,
  validateBody(spendBudgetSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = await ensurePersistedSpendBudget(req.user.id, req.user.email);
      const { maximumLimitUsd, providerWorkEnabled } = context;
      if (!providerWorkEnabled) {
        throw AppError.fromHttpStatus(
          403,
          "Free Builder does not fund live provider work. Activate a paid plan before editing this guard.",
        );
      }

      const limit = Number(req.body.monthly_limit_usd ?? 0);
      const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
      const hardCap = true;
      const enabled = true;

      if (!Number.isFinite(limit) || !(limit > 0) || limit > maximumLimitUsd) {
        throw AppError.fromHttpStatus(
          400,
          `monthly_limit_usd must be greater than zero and no more than ${maximumLimitUsd.toFixed(2)} for the active plan`,
        );
      }
      if (!Number.isInteger(warn) || warn < 1 || warn > 99) {
        throw AppError.fromHttpStatus(400, "warn_threshold_pct must be 1–99");
      }
      if (req.body.hard_cap === false || req.body.enabled === false) {
        throw AppError.fromHttpStatus(
          400,
          "The provider spend guard is always enabled with a hard cap.",
        );
      }

      const [budget] = await drizzle
        .insert(schema.spendBudgets)
        .values({
          userId: req.user.id,
          monthlyLimitUsd: limit.toString(),
          hardCap,
          warnThresholdPct: warn,
          enabled,
          managedDefault: false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.spendBudgets.userId,
          set: {
            monthlyLimitUsd: limit.toString(),
            hardCap,
            warnThresholdPct: warn,
            enabled,
            managedDefault: false,
            updatedAt: new Date(),
          },
        })
        .returning();

      clearBudgetCache(req.user.id);
      res.json({ budget, maximum_limit_usd: maximumLimitUsd });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Failed to save spend budget", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to save budget");
    }
  },
);

router.get(
  "/api/spend/status",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = await ensurePersistedSpendBudget(req.user.id, req.user.email);
      const { maximumLimitUsd, planId, planName, providerWorkEnabled, guardScope } = context;
      const snap = await getBudgetSnapshot(req.user.id, true);
      const alerts = await drizzle
        .select({
          thresholdPct: schema.spendAlerts.thresholdPct,
          firedAt: schema.spendAlerts.firedAt,
        })
        .from(schema.spendAlerts)
        .where(
          and(
            eq(schema.spendAlerts.userId, req.user.id),
            eq(schema.spendAlerts.period, snap.period),
          ),
        )
        .orderBy(schema.spendAlerts.thresholdPct);

      const persistedLimit = snap.budget?.monthly_limit_usd
        ? Number(snap.budget.monthly_limit_usd)
        : 0;
      const displayLimit = providerWorkEnabled ? persistedLimit : 0;
      const percentUsed = displayLimit > 0 ? (snap.mtdCost / displayLimit) * 100 : 0;
      const hardCappedNow = providerWorkEnabled
        ? await isHardSpendCapExceeded(req.user.id)
        : false;

      res.json({
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: displayLimit,
        maximum_limit_usd: maximumLimitUsd,
        percent_used: Number(percentUsed.toFixed(1)),
        hard_cap: providerWorkEnabled ? (snap.budget?.hard_cap ?? true) : true,
        enabled: providerWorkEnabled ? (snap.budget?.enabled ?? true) : false,
        warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
        hard_capped_now: hardCappedNow,
        alerts_fired: alerts,
        plan_id: planId,
        plan_name: planName,
        provider_work_enabled: providerWorkEnabled,
        customer_editable: providerWorkEnabled,
        guard_scope: guardScope,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Failed to load spend status", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load spend status");
    }
  },
);

export default router;
