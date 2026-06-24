import { Router, Response, NextFunction } from "express";
import { AppError } from "../lib/api-error";
import { planById } from "../lib/plan-catalog";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * Keep legacy personal Stripe prices usable for existing subscribers while
 * preventing direct-link or stale-client acquisition into retired plans.
 * This router sits immediately before the legacy billing router; current
 * public business plans continue untouched.
 */
router.post(
  "/api/billing/checkout",
  authenticateUser,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const planId = String(req.body?.plan_id || "").trim();
    const plan = planById(planId);

    if (!plan) return next();
    if (plan.public !== false) return next();

    return res.status(410).json({
      code: "LEGACY_PLAN_RETIRED",
      error:
        "This personal subscription is no longer offered. Build and test for free, then add Conversation Balance when you are ready for live work.",
      replacement: "conversation_balance",
    });
  },
);

export default router;
