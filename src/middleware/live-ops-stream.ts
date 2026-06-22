import type { NextFunction, Request, Response } from "express";
import { authenticateEventStream } from "./auth";

/**
 * Authenticates the live-ops SSE stream and derives tenant scope exclusively
 * from the signed-in session. Client-provided tenant identifiers are ignored.
 */
export function authenticateLiveOpsStream(req: Request, res: Response, next: NextFunction) {
  return authenticateEventStream(req, res, () => {
    if (!req.tenantId && !req.user?.id) {
      return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    }
    return next();
  });
}
