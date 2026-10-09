import express, { Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { validateBody, spendBudgetSchema } from "../lib/api-validation";
import { BOTBOUND_BRAND_NAME, LEGACY_WIRELINE_NAME } from "../lib/brand";
import { clearBudgetCache, getBudgetSnapshot, isHardSpendCapExceeded } from "../lib/spend-guards";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import {
  defaultAiSpendBudgetUsdForPlan,
  getEffectiveSubscriptionPlanId,
  subscriptionPlanToTier,
} from "../lib/plan-entitlements";
import { planById } from "../lib/plan-catalog";
import { platformCostReserveUsd } from "../middleware/audit-middleware";
import {
  OPENAI_FREE_REHEARSAL_SECONDS,
  realtimeReserveForWindowUsd,
} from "../lib/voice/openai-realtime-pricing";

const router = express.Router();

type PersistedSpendBudget = typeof schema.spendBudgets.$inferSelect;
type SpendGuardScope = "plan_funded" | "free_simulation_allowance";

type PersistedSpendBudgetContext = {
  budget: PersistedSpendBudget;
  maximumLimitUsd: number;
  planId: string | null;
  planName: string;
  liveProviderWorkEnabled: boolean;
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

function customerPlanName(name: string | null | undefined): string {
  const normalized = String(name || "").trim();
  if (!normalized) return "";
  const legacyPrefix = `${LEGACY_WIRELINE_NAME} `;
  if (normalized.startsWith(legacyPrefix)) {
    return `${BOTBOUND_BRAND_NAME} ${normalized.slice(legacyPrefix.length)}`;
  }
  return normalized;
}

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
      `${BOTBOUND_BRAND_NAME} could not resolve the active plan for provider spend controls.`,
    );
  }

  const liveProviderWorkEnabled = tier !== "free";
  const maximumLimitUsd = defaultAiSpendBudgetUsdForPlan(planId);
  const planName =
    customerPlanName(resolvedPlan?.name) ||
    `${BOTBOUND_BRAND_NAME} ${liveProviderWorkEnabled ? "Live" : "Free Builder"}`;
  const guardScope: SpendGuardScope = liveProviderWorkEnabled
    ? "plan_funded"
    : "free_simulation_allowance";

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
    liveProviderWorkEnabled,
    guardScope,
  };
}

router.get(
  "/api/spend/budget",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = await ensurePersistedSpendBudget(req.user.id, req.user.email);
      const { budget, maximumLimitUsd, planId, planName, liveProviderWorkEnabled, guardScope } =
        context;
      res.json({
        budget: {
          monthly_limit_usd: budget.monthlyLimitUsd,
          maximum_limit_usd: maximumLimitUsd,
          hard_cap: budget.hardCap,
          warn_threshold_pct: budget.warnThresholdPct,
          enabled: budget.enabled,
          updated_at: budget.updatedAt,
          plan_id: planId,
          plan_name: planName,
          live_provider_work_enabled: liveProviderWorkEnabled,
          simulation_allowance_enabled: guardScope === "free_simulation_allowance",
          customer_editable: true,
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
      const { maximumLimitUsd } = await ensurePersistedSpendBudget(req.user.id, req.user.email);
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
        throw AppError.fromHttpStatus(400, "warn_threshold_pct must be 1 to 99");
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
      const { maximumLimitUsd, planId, planName, liveProviderWorkEnabled, guardScope } = context;
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

      const limit = snap.budget?.monthly_limit_usd ? Number(snap.budget.monthly_limit_usd) : 0;
      const percentUsed = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
      const hardCappedNow = await isHardSpendCapExceeded(req.user.id);
      // Free Builder sees how many voice tests its allowance still covers.
      const freeAllowance = guardScope === "free_simulation_allowance";
      const voiceReserveUsd = realtimeReserveForWindowUsd(
        platformCostReserveUsd("openai_realtime_session"),
        OPENAI_FREE_REHEARSAL_SECONDS,
      );
      const voiceRehearsalsRemaining =
        freeAllowance && limit > 0
          ? Math.max(0, Math.floor(Number(((limit - snap.mtdCost) / voiceReserveUsd).toFixed(6))))
          : null;

      res.json({
        period: snap.period,
        start_at: snap.start_at,
        reset_at: snap.reset_at,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: limit,
        maximum_limit_usd: maximumLimitUsd,
        percent_used: Number(percentUsed.toFixed(1)),
        hard_cap: snap.budget?.hard_cap ?? true,
        enabled: snap.budget?.enabled ?? true,
        warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
        hard_capped_now: hardCappedNow,
        alerts_fired: alerts,
        plan_id: planId,
        plan_name: planName,
        live_provider_work_enabled: liveProviderWorkEnabled,
        simulation_allowance_enabled: guardScope === "free_simulation_allowance",
        customer_editable: true,
        guard_scope: guardScope,
        voice_rehearsal_reserve_usd: freeAllowance ? voiceReserveUsd : null,
        voice_rehearsal_seconds: freeAllowance ? OPENAI_FREE_REHEARSAL_SECONDS : null,
        voice_rehearsals_remaining: voiceRehearsalsRemaining,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Failed to load spend status", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load spend status");
    }
  },
);

export default router;
