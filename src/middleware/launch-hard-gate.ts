/**
 * Billing release + launch hard gates.
 *
 * Every route that can create a new Stripe charge or subscription session is
 * explicitly mounted behind `enforceSelfServeBillingRelease`. The optional
 * global launch gate separately blocks spend paths when LAUNCH_HARD_GATE=true
 * and readiness reports launch blockers. Federal DNC / compliance is deferred
 * from the GO score and does not hard-block.
 */
import type { Request, Response, NextFunction } from "express";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
} from "../lib/billing-release";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";

export function enforceSelfServeBillingRelease(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (selfServeBillingEnabled()) return next();
  return res
    .status(SELF_SERVE_BILLING_BLOCK.status)
    .json(selfServeBillingBlockResponse());
}

export function enforceLaunchHardGate(_req: Request, res: Response, next: NextFunction) {
  if (!isLaunchHardBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
