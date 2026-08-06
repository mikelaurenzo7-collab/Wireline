/**
 * Hard launch gate — blocks self-serve checkout unless billing has been
 * explicitly released, then optionally blocks other spend paths when
 * LAUNCH_HARD_GATE=true and readiness reports launch blockers.
 * Federal DNC / compliance is deferred from the GO score and does not hard-block.
 */
import type { Request, Response, NextFunction } from "express";
import { selfServeBillingEnabled } from "../lib/billing-release";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";

export function enforceLaunchHardGate(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/billing/checkout" && !selfServeBillingEnabled()) {
    return res.status(503).json({
      code: "BILLING_LAUNCH_NOT_APPROVED",
      error: "Self-serve billing is temporarily unavailable while launch certification is completed.",
    });
  }
  if (!isLaunchHardBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
