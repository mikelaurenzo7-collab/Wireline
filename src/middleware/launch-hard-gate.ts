/**
 * Billing release + launch hard gates.
 *
 * Every route that can create a new Stripe charge or subscription session must
 * be covered by the default-closed billing release control. The optional global
 * launch gate then blocks other spend paths when LAUNCH_HARD_GATE=true and
 * readiness reports launch blockers. Federal DNC / compliance is deferred from
 * the GO score and does not hard-block.
 */
import type { Request, Response, NextFunction } from "express";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
} from "../lib/billing-release";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";

const SELF_SERVE_BILLING_PATHS = new Set([
  "/api/billing/checkout",
  "/api/conversation-balance/checkout",
  "/api/billing/live-video-checkout",
]);

export function isSelfServeBillingRequest(req: Request): boolean {
  const rawPath = String(req.originalUrl || req.url || req.path || "").split("?", 1)[0];
  const normalizedPath = rawPath.replace(/\/+$/, "").toLowerCase();
  return SELF_SERVE_BILLING_PATHS.has(normalizedPath);
}

export function enforceLaunchHardGate(req: Request, res: Response, next: NextFunction) {
  if (isSelfServeBillingRequest(req) && !selfServeBillingEnabled()) {
    return res
      .status(SELF_SERVE_BILLING_BLOCK.status)
      .json(selfServeBillingBlockResponse());
  }
  if (!isLaunchHardBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
