/**
 * Hard launch gate — blocks spend paths when LAUNCH_HARD_GATE=true and voice stack down.
 */
import type { Request, Response, NextFunction } from "express";
import { isVoiceLaunchBlocked, launchBlockResponse } from "../lib/launch-readiness";

export function enforceLaunchHardGate(req: Request, res: Response, next: NextFunction) {
  if (!isVoiceLaunchBlocked()) return next();
  return res.status(503).json(launchBlockResponse());
}
