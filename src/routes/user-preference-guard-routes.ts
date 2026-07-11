import { Router, type NextFunction, type Response } from "express";

import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

function preferenceEnvelope(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * Provider approval and review evidence are server-owned. Strip that namespace
 * from the client payload before the canonical settings route performs its
 * locked read/merge/write. Reading the database here would create a lost-update
 * window between this middleware and the downstream JSON-envelope write.
 */
router.post(
  "/api/user-preferences",
  authenticateUser,
  (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.body?.preferences || typeof req.body.preferences !== "object") {
      next();
      return;
    }

    const requestedEnvelope = preferenceEnvelope(req.body.preferences);
    delete requestedEnvelope.company_identity;
    req.body = { ...req.body, preferences: requestedEnvelope };
    next();
  },
);

export default router;
