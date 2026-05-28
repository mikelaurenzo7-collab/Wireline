/* eslint-disable @typescript-eslint/no-explicit-any -- admin migration routes normalize heterogeneous legacy rows during one-off backfills. */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { authenticateUser } from "../../middleware/auth";
import type { AuthenticatedRequest } from "../../types/auth";

/**
 * Authorize a migration call via EITHER:
 *   1. OWNER_EMAIL-matching authenticated user, OR
 *   2. X-Migration-Token header matching MIGRATION_TOKEN env var
 *      (constant-time compared to prevent timing leaks).
 *
 * Lets ops + CI run migrations without an interactive sign-in flow.
 * Returns true if authorized, false (with res 403 sent) otherwise.
 */
function authorizeMigration(req: Request, res: Response): boolean {
  const provided = req.headers["x-migration-token"] as string | undefined;
  const expected = process.env.MIGRATION_TOKEN;
  if (provided && expected) {
    try {
      const providedBuf = Buffer.from(provided, "utf8");
      const expectedBuf = Buffer.from(expected, "utf8");
      if (
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf)
      ) {
        return true;
      }
    } catch {
      /* fall through to owner-email check */
    }
  }
  const ownerEmail = process.env.OWNER_EMAIL;
  const user = (req as AuthenticatedRequest).user;
  if (ownerEmail && user?.email === ownerEmail) return true;
  res.status(403).json({ error: "Owner only." });
  return false;
}

// Permissive middleware — runs authenticateUser if a bearer token is
// present (so req.user populates for the owner-email check), otherwise
// skips auth (so the X-Migration-Token path works without a session).
function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const hasBearer = (req.headers.authorization || "").startsWith("Bearer ");
  if (!hasBearer) return next();
  return (authenticateUser as any)(req, res, next);
}

export { authorizeMigration, optionalAuth };
