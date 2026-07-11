import { Router, type NextFunction, type Response } from "express";
import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

function preferenceEnvelope(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * The generic preferences endpoint is intentionally broad for UI preferences,
 * but provider approval and review evidence are server-owned. Preserve that
 * namespace before the downstream settings route replaces the JSON envelope.
 */
router.post(
  "/api/user-preferences",
  authenticateUser,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.body?.preferences || typeof req.body.preferences !== "object") {
        next();
        return;
      }

      const [existing] = await drizzle
        .select({ preferences: schema.userPreferences.preferences })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, req.user.id))
        .limit(1);
      const currentEnvelope = preferenceEnvelope(existing?.preferences);
      const requestedEnvelope = preferenceEnvelope(req.body.preferences);

      if (Object.prototype.hasOwnProperty.call(currentEnvelope, "company_identity")) {
        requestedEnvelope.company_identity = currentEnvelope.company_identity;
      } else {
        delete requestedEnvelope.company_identity;
      }

      req.body = { ...req.body, preferences: requestedEnvelope };
      next();
    } catch (error) {
      log.error("server-owned preference guard failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      next(error);
    }
  },
);

export default router;
