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
import { log } from "../lib/server-context";
import {
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  ALL_ROLES,
  FALLBACK_ACCESS_ROLE,
  hasPermission,
  resolveStoredRole,
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
  tenantIdOrUserId: string,
  maybeUserId?: string,
): Promise<AccessRole> {
  const tenantId = maybeUserId ? tenantIdOrUserId : tenantIdOrUserId;
  const userId = maybeUserId || tenantIdOrUserId;
  const cacheKey = `${tenantId}:${userId}`;
  const cached = roleCache.get(cacheKey);
  if (cached && Date.now() - cached.cached_at < ROLE_CACHE_TTL_MS) {
    return cached.role;
  }

  const [data] = await drizzle
    .select({ role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.tenantId, tenantId),
        eq(schema.teamMembers.userId, userId),
        isNull(schema.teamMembers.revokedAt),
      ),
    )
    .orderBy(desc(schema.teamMembers.createdAt))
    .limit(1);

  if (!data) {
    // No membership row at all. That is only legitimate when the caller IS the
    // tenant — the fresh-install / self-hosted case documented at the top of
    // this file, where the authenticated user owns their data by definition.
    if (tenantId !== userId) {
      throw new Error("No active membership for tenant");
    }
    roleCache.set(cacheKey, { role: "owner", cached_at: Date.now() });
    return "owner";
  }

  // A membership row EXISTS, so the stored role decides — the own-tenant owner
  // default must not survive into this branch.
  //
  // It used to. The resolution initialised the role variable to the owner
  // default and narrowed it only when the stored string was a ROLE_HIERARCHY
  // key — and "member" is not one. It is the invite enum's default and its
  // least-privileged intended seat, yet it fell through to full owner privilege
  // on every requirePermission/requireRole route. Inviting someone as "admin"
  // or "viewer" was enforced correctly, so the ordering was inverted: only the
  // safe-looking default escalated.
  const role = resolveStoredRole(data.role);
  if (data.role && !ALL_ROLES.includes(data.role as AccessRole) && role === FALLBACK_ACCESS_ROLE) {
    // Unknown vocabulary is a data problem worth seeing rather than silently
    // read-only-ing someone who should have had more.
    log.warn("Unrecognised team member role resolved to least privilege", {
      tenantId,
      userId,
      storedRole: data.role,
      resolvedRole: role,
    });
  }
  roleCache.set(cacheKey, { role, cached_at: Date.now() });
  return role;
}

/** Force-bust the role cache (e.g. after a role change). */
export function invalidateRoleCache(userId: string, tenantId?: string): void {
  if (tenantId) {
    roleCache.delete(`${tenantId}:${userId}`);
    return;
  }
  for (const key of [...roleCache.keys()]) {
    if (key.endsWith(`:${userId}`)) roleCache.delete(key);
  }
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
        const tenantId = ((req as any).tenantId as string | undefined) || userId;
        const role = await getCallerRole(deps.drizzle, tenantId, userId);
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
              .catch((e: unknown) => log.warn("audit log failed", { error: String(e) }));
          }
          deny(res, 403, "Forbidden: insufficient permissions", "FORBIDDEN");
          return;
        }
        next();
      } catch (err) {
        // Fail-CLOSED on role lookup errors.
        log.error("[require-role] role lookup failed", { error: (err as Error).message });
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
        const tenantId = ((req as any).tenantId as string | undefined) || userId;
        const role = await getCallerRole(deps.drizzle, tenantId, userId);
        (req as any).role = role;
        if (ROLE_HIERARCHY[role] < threshold) {
          deny(res, 403, `Forbidden: requires role "${minRole}" or higher`, "FORBIDDEN");
          return;
        }
        next();
      } catch (err) {
        log.error("[require-role] role lookup failed", { error: (err as Error).message });
        deny(res, 403, "Authorization check failed", "FORBIDDEN");
        return;
      }
    };
  }

  return { requirePermission, requireRole };
}

// Re-export ROLE_PERMISSIONS so server.ts has one import surface.
export { ROLE_PERMISSIONS };
