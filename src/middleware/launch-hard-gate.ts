/**
 * Hard launch gate — blocks self-serve checkout unless billing has been
 * explicitly released, then optionally blocks other spend paths when
 * LAUNCH_HARD_GATE=true and readiness reports launch blockers.
 * Federal DNC / compliance is deferred from the GO score and does not hard-block.
 */
import type { Request, Response, NextFunction } from "express";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
} from "../lib/billing-release";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";

export function isSelfServeCheckoutRequest(req: Request): boolean {
  const rawPath = String(req.originalUrl || req.url || req.path || "").split("?", 1)[0];
  const normalizedPath = rawPath.replace(/\/+$/, "").toLowerCase();
  return normalizedPath === "/api/billing/checkout";
}

export function enforceLaunchHardGate(req: Request, res: Response, next: NextFunction) {
  if (isSelfServeCheckoutRequest(req) && !selfServeBillingEnabled()) {
    return res
      .status(SELF_SERVE_BILLING_BLOCK.status)
      .json(selfServeBillingBlockResponse());
  }
  if (!isLaunchHardBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
