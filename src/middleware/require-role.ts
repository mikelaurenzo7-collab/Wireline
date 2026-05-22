/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
// RBAC enforcement middleware backed by `wireline_team_members`.
//
// The role hierarchy + permission map live in `src/lib/soc2-controls.ts`.
// This file is the Express glue: resolve a caller's role from the DB,
// cache it on `req.role`, and short-circuit 403 when the requested
// permission isn't held.
//
// Why a factory: `server.ts` already owns `db` (service-role Supabase
// client) and `auditLogger` as module singletons. We close over them
// here so route files just import `requirePermission("...")` without
// each route having to thread the deps.
//
// Single-tenant fallback: when the caller has no `wireline_team_members`
// row, they are treated as the OWNER of their own account. This keeps
// fresh installs working before any team has been invited — the
// authenticated user owns their data by definition.

import type { Request, Response, NextFunction } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import {
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  hasPermission,
  type AccessRole,
} from "../lib/soc2-controls";

interface RoleCacheEntry {
  role: AccessRole;
  cached_at: number;
}

const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, RoleCacheEntry>();

export interface RbacDeps {
  drizzle: VercelPgDatabase<typeof schema>;
  auditLogger?: {
    logSecurity?: (
      action: "rate_limit_exceeded" | "unauthorized_access" | "suspicious_activity",
      params: {
        userId?: string;
        resource?: string;
        ip?: string;
        userAgent?: string;
        metadata?: Record<string, unknown>;
      },
    ) => Promise<unknown>;
  };
}

/**
 * Resolve the caller's effective role.
 *
 * Looks up `wireline_team_members.role` for the calling user. The
 * special case `data === null` (no membership row found) returns the
 * single-tenant default `owner` — fresh installs and self-hosted
 * deployments where no team has been invited still work. Any actual DB
 * error PROPAGATES so the caller can fail-CLOSED (returns 403 in the
 * middleware below) rather than incorrectly granting privileges.
 *
 * Result is cached per user-id for 30s to avoid hammering the DB.
 */
export async function getCallerRole(
  drizzle: VercelPgDatabase<typeof schema>,
  userId: string,
): Promise<AccessRole> {
  const cached = roleCache.get(userId);
  if (cached && Date.now() - cached.cached_at < ROLE_CACHE_TTL_MS) {
    return cached.role;
  }

  const [data] = await drizzle
    .select({ role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), isNull(schema.teamMembers.revokedAt)))
    .orderBy(desc(schema.teamMembers.createdAt))
    .limit(1);

  let role: AccessRole = "owner";
  const r = data?.role;
  if (r && r in ROLE_HIERARCHY) {
    role = r as AccessRole;
  }
  roleCache.set(userId, { role, cached_at: Date.now() });
  return role;
}

/** Force-bust the role cache (e.g. after a role change). */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId);
}

function deny(res: Response, status: 401 | 403, message: string, code: string): void {
  res.status(status).json({ error: message, code });
}

/**
 * Build the requirePermission/requireRole middleware pair, bound to
 * the supplied DB + audit logger. Call once at server boot.
 *
 *   const { requirePermission, requireRole } = createRbacMiddleware({ db, auditLogger });
 *   app.put("/api/quotas/override", authenticateUser, requirePermission("quotas.override"), handler);
 */
export function createRbacMiddleware(deps: RbacDeps) {
  function requirePermission(permission: string) {
    return async function requirePermissionMw(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        deny(res, 401, "Authentication required", "AUTH_REQUIRED");
        return;
      }
      try {
        const role = await getCallerRole(deps.drizzle, userId);
        (req as any).role = role;
        if (!hasPermission(role, permission)) {
          // Audit the refused privilege use — SOC 2 CC7.2 evidence.
          if (deps.auditLogger?.logSecurity) {
            void deps.auditLogger
              .logSecurity("unauthorized_access", {
                userId,
                resource: permission,
                ip: req.ip,
                userAgent: req.get("user-agent") ?? undefined,
                metadata: { required_permission: permission, role },
              })
              .catch(() => {});
          }
          deny(res, 403, `Forbidden: role "${role}" lacks permission "${permission}"`, "FORBIDDEN");
          return;
        }
        next();
      } catch (err) {
        // Fail-CLOSED on role lookup errors.
        console.error("[require-role] role lookup failed:", (err as Error).message);
        deny(res, 403, "Authorization check failed", "FORBIDDEN");
        return;
      }
    };
  }

  function requireRole(minRole: AccessRole) {
    const threshold = ROLE_HIERARCHY[minRole];
    return async function requireRoleMw(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        deny(res, 401, "Authentication required", "AUTH_REQUIRED");
        return;
      }
      try {
        const role = await getCallerRole(deps.drizzle, userId);
        (req as any).role = role;
        if (ROLE_HIERARCHY[role] < threshold) {
          deny(res, 403, `Forbidden: requires role "${minRole}" or higher`, "FORBIDDEN");
          return;
        }
        next();
      } catch (err) {
        console.error("[require-role] role lookup failed:", (err as Error).message);
        deny(res, 403, "Authorization check failed", "FORBIDDEN");
        return;
      }
    };
  }

  return { requirePermission, requireRole };
}

// Re-export ROLE_PERMISSIONS so server.ts has one import surface.
export { ROLE_PERMISSIONS };
