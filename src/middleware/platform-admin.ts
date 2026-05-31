/**
 * Platform-admin authorization.
 * ---------------------------------------------------------------------------
 * Gates *platform-level* operations (purge accounts, sync the live Vapi
 * assistants, seed demo data, Stripe customer audits). These are NOT tenant
 * operations — they act across every tenant's data — so they must not use the
 * tenant RBAC in `require-role.ts`, which treats every authenticated user as
 * the "owner" of their own account (single-tenant fallback) and would
 * therefore grant platform-admin power to everyone.
 *
 * Historically these routes hard-coded `req.user.email === OWNER_EMAIL`, which
 * pins platform administration to a single env-configured address. This module
 * keeps that as a fallback but adds **role-based** authorization: any user with
 * `wireline_users.is_admin = true` is a platform admin too. That lets you
 * designate additional admins in the database without redeploying, and without
 * sharing the owner account.
 *
 * Authorization decisions flow through {@link AppError} so denials/errors use
 * the standard `{ error, code, requestId }` shape from the global handler, and
 * denied attempts are written to the security audit log (SOC 2 CC7.2 evidence).
 */

import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { drizzle, log, auditLogger } from "../lib/server-context";
import { isOwnerEmail } from "../lib/auth-service";
import { getErrorMessage } from "../lib/server-utils";
import { AppError } from "../lib/api-error";

interface AdminUser {
  id?: string;
  email?: string;
}

/**
 * Resolve whether the supplied caller is a Wireline platform admin.
 *
 * Grants when EITHER:
 *   1. the caller's email matches `OWNER_EMAIL` (backward-compatible owner), OR
 *   2. the caller's `wireline_users.is_admin` column is `true`.
 *
 * Any DB error PROPAGATES so the middleware can fail-CLOSED rather than
 * incorrectly granting privileges.
 */
export async function isPlatformAdmin(user: AdminUser | undefined): Promise<boolean> {
  if (!user?.id) return false;

  // Owner email is the canonical superadmin and needs no DB round-trip.
  if (isOwnerEmail(user.email)) return true;

  const [row] = await drizzle
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return row?.isAdmin === true;
}

/**
 * Express middleware: allow the request only if the caller is a platform admin.
 *
 * Must run after `authenticateUser` (it reads `req.user`). On denial it
 * forwards an {@link AppError} to `next()` so the response is standardized and
 * the denied attempt is captured in the security audit log.
 */
export async function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as Request & { user?: AdminUser }).user;

  if (!user?.id) {
    next(AppError.unauthorized());
    return;
  }

  let allowed = false;
  try {
    allowed = await isPlatformAdmin(user);
  } catch (err) {
    // Fail-CLOSED on lookup errors.
    log.error("[platform-admin] admin check failed", {
      error: getErrorMessage(err),
      path: req.path,
    });
    next(AppError.internal("Authorization check failed"));
    return;
  }

  if (allowed) {
    next();
    return;
  }

  // Audit the refused platform-admin attempt — SOC 2 CC7.2 evidence.
  void auditLogger
    .logSecurity("unauthorized_access", {
      userId: user.id,
      resource: `${req.method} ${req.path}`,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
      metadata: { scope: "platform_admin" },
    })
    .catch((e: unknown) => log.warn("audit log failed", { error: getErrorMessage(e) }));

  next(AppError.forbidden("Platform admin access required"));
}
