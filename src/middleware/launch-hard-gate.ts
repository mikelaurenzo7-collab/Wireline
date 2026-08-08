/**
 * Hard launch gate — when LAUNCH_HARD_GATE=true, blocks spend paths if
 * evaluateLaunchReadiness() reports any launch blockers (core / billing / voice).
 * Federal DNC / compliance is deferred from the GO score and does not hard-block.
 * Opt-in only; unset/false leaves soft-launch spend paths open.
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
