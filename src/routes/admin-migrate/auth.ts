 

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { isOwnerEmail } from "../../lib/auth-service";
import { getSessionTokenFromRequest } from "../../lib/session-cookie";
import { verifyInternalJwt } from "../../lib/auth-utils";
import { requireInternalJwtSecret } from "../../lib/internal-jwt-secret";
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
  const user = (req as AuthenticatedRequest).user;
  if (isOwnerEmail(user?.email)) return true;
  res.status(403).json({ error: "Owner only." });
  return false;
}

/**
 * Best-effort session attach for migration routes: populates req.user from the
 * httpOnly cookie or Bearer token without rejecting unauthenticated callers
 * (X-Migration-Token-only CI paths still work).
 */
async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authedReq = req as AuthenticatedRequest;
  if (authedReq.user?.id) return next();

  const token = getSessionTokenFromRequest(req);
  if (!token) return next();

  try {
    const payload = await verifyInternalJwt(token, requireInternalJwtSecret());
    if (payload?.sub && payload.email) {
      authedReq.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || "authenticated",
      };
    }
  } catch {
    /* unauthenticated migration-token callers proceed without req.user */
  }
  return next();
}

export { authorizeMigration, optionalAuth };
