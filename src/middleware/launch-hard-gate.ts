/**
 * Hard launch gate — when LAUNCH_HARD_GATE=true, blocks spend paths if
 * evaluateLaunchReadiness() reports any launch blockers (voice/billing/compliance/core).
 * Opt-in only; unset/false leaves soft-launch spend paths open.
 */
import type { Request, Response, NextFunction } from "express";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";

export function enforceLaunchHardGate(_req: Request, res: Response, next: NextFunction) {
  if (!isLaunchHardBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
