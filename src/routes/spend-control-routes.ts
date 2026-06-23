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

const router = express.Router();

/**
 * This router intentionally mounts before the legacy billing router. It keeps
 * the request shape compatible while making a user-selected hard cap real for
 * new outbound work instead of silently coercing it to false.
 */
router.put(
  "/api/spend/budget",
  authenticateUser,
  validateBody(spendBudgetSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = Number(req.body.monthly_limit_usd ?? 0);
      const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
      const hardCap = req.body.hard_cap === true;
      const enabled = req.body.enabled !== false;

      if (!Number.isFinite(limit) || limit < 0) {
        throw AppError.fromHttpStatus(400, "monthly_limit_usd must be a non-negative number");
      }
      if (!Number.isInteger(warn) || warn < 1 || warn > 99) {
        throw AppError.fromHttpStatus(400, "warn_threshold_pct must be 1–99");
      }
      if (hardCap && !(limit > 0)) {
        throw AppError.fromHttpStatus(400, "A hard cap requires a monthly_limit_usd greater than zero.");
      }

      const [budget] = await drizzle
        .insert(schema.spendBudgets)
        .values({
          userId: req.user.id,
          monthlyLimitUsd: limit.toString(),
          hardCap,
          warnThresholdPct: warn,
          enabled,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.spendBudgets.userId,
          set: {
            monthlyLimitUsd: limit.toString(),
            hardCap,
            warnThresholdPct: warn,
            enabled,
            updatedAt: new Date(),
          },
        })
        .returning();

      clearBudgetCache(req.user.id);
      res.json({ budget });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Failed to save spend budget", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to save budget");
    }
  },
);

router.get("/api/spend/status", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await getBudgetSnapshot(req.user.id, true);
    const alerts = await drizzle
      .select({
        thresholdPct: schema.spendAlerts.thresholdPct,
        firedAt: schema.spendAlerts.firedAt,
      })
      .from(schema.spendAlerts)
      .where(and(eq(schema.spendAlerts.userId, req.user.id), eq(schema.spendAlerts.period, snap.period)))
      .orderBy(schema.spendAlerts.thresholdPct);

    const limit = snap.budget?.monthly_limit_usd ? Number(snap.budget.monthly_limit_usd) : 0;
    const percentUsed = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
    const hardCappedNow = await isHardSpendCapExceeded(req.user.id);

    res.json({
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: limit,
      percent_used: Number(percentUsed.toFixed(1)),
      hard_cap: snap.budget?.hard_cap ?? false,
      enabled: snap.budget?.enabled ?? true,
      warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
      hard_capped_now: hardCappedNow,
      alerts_fired: alerts,
    });
  } catch (err) {
    log.error("Failed to load spend status", { error: getErrorMessage(err) });
    throw AppError.fromHttpStatus(500, "Failed to load spend status");
  }
});

export default router;
