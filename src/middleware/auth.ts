import type { Request, Response, NextFunction } from "express";
import type { User } from "../types/auth";
import { log, auditLogger, tenantStore, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifyInternalJwt, type JwtPayload } from "../lib/auth-utils";
import { isSessionGenerationActive } from "../lib/session-generation";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { getSessionTokenFromRequest, isProductionRuntime } from "../lib/session-cookie";
import { sharedWorkspacesEnabled } from "../lib/shared-workspace-readiness";
import { sessionUsers, secureTeamMembers } from "../db/security-schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

interface AuthedReq extends Request {
  user?: User;
  tenantId?: string;
}

type ActiveSessionUser = {
  id: string;
  email: string;
  sessionRevokedBefore: Date;
  sessionVersion: number;
};

async function loadActiveSessionUser(payload: JwtPayload): Promise<ActiveSessionUser | null> {
  return tenantStore.run(payload.sub, async () => {
    const [user] = await drizzle
      .select({
        id: sessionUsers.id,
        email: sessionUsers.email,
        sessionRevokedBefore: sessionUsers.sessionRevokedBefore,
        sessionVersion: sessionUsers.sessionVersion,
      })
      .from(sessionUsers)
      .where(eq(sessionUsers.id, payload.sub))
      .limit(1);
    if (!user) return null;

    return isSessionGenerationActive(payload, user) ? user : null;
  });
}

async function resolveTenantId(
  req: Request,
  userId: string,
  tokenTenantId?: string,
): Promise<string> {
  const headerTenantId = req.get("x-wireline-tenant-id")?.trim();
  const requested = tokenTenantId?.trim() || headerTenantId;
  if (!requested || requested === userId) return userId;

  // Certification is a data-plane boundary, not merely a UI/team-route flag.
  // Ignore every shared-tenant claim and header across the entire API until
  // the actor-id/tenant-id audit has been explicitly certified.
  if (!sharedWorkspacesEnabled()) {
    log.warn("Ignoring shared tenant selection before data-plane certification", {
      userId,
      requestedTenantId: requested,
      path: req.path,
      requestId: (req.res as Response | undefined)?.locals?.requestId,
    });
    return userId;
  }

  const [membership] = await tenantStore.run(userId, () =>
    drizzle
      .select({ id: secureTeamMembers.id })
      .from(secureTeamMembers)
      .where(
        and(
          eq(secureTeamMembers.tenantId, requested),
          eq(secureTeamMembers.userId, userId),
          isNotNull(secureTeamMembers.acceptedAt),
          isNull(secureTeamMembers.revokedAt),
        ),
      )
      .limit(1),
  );
  if (membership) return requested;

  log.warn("Ignoring unverified tenant selection", {
    userId,
    requestedTenantId: requested,
    path: req.path,
    requestId: (req.res as Response | undefined)?.locals?.requestId,
  });
  return userId;
}

function runInTenantContext(req: Request, tenantId: string, next: NextFunction) {
  return tenantStore.getStore() ? next() : tenantStore.run(tenantId, () => next());
}

function authRequired(res: Response, code: "AUTH_INVALID" | "AUTH_REVOKED" = "AUTH_INVALID") {
  return res.status(401).json({
    error: code === "AUTH_REVOKED" ? "Session has been revoked" : "Invalid or expired session",
    code,
    requestId: res.locals?.requestId,
  });
}

async function verifyRequestSession(req: Request, res: Response) {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      error: "No authorization token provided",
      code: "AUTH_REQUIRED",
      requestId: res.locals?.requestId,
    });
    return null;
  }

  let secret: string;
  try {
    secret = requireInternalJwtSecret();
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("JWT_SECRET_NOT_CONFIGURED") || message.includes("JWT_SECRET_CONFLICT")) {
      log.error("Auth middleware: JWT secret misconfigured", { error: message });
      res.status(503).json({
        error: "Authentication is temporarily unavailable. Platform configuration is incomplete.",
        code: "AUTH_NOT_CONFIGURED",
        requestId: res.locals?.requestId,
      });
      return null;
    }
    throw error;
  }

  const payload = await verifyInternalJwt(token, secret);
  if (!payload) {
    void auditLogger
      .logAuth("failed_login", {
        email: req.body?.email,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        reason: "invalid_token",
        requestId: res.locals?.requestId,
      })
      .catch((error: unknown) =>
        log.warn("audit log failed", { error: getErrorMessage(error) }),
      );
    authRequired(res);
    return null;
  }

  const activeUser = await loadActiveSessionUser(payload);
  if (!activeUser) {
    authRequired(res, "AUTH_REVOKED");
    return null;
  }
  return { payload, activeUser };
}

function attachUser(authedReq: AuthedReq, payload: JwtPayload, activeUser: ActiveSessionUser): void {
  authedReq.user = {
    id: activeUser.id,
    email: activeUser.email,
    role: payload.role || "authenticated",
    aud: payload.aud,
    sessionVersion: activeUser.sessionVersion,
    // Start from the actor's own tenant. Authentication replaces this only
    // after certification and membership validation succeed.
    tenantId: activeUser.id,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(payload.iat * 1000).toISOString(),
  } as User;
}

function attachValidatedTenant(authedReq: AuthedReq, tenantId: string): void {
  authedReq.tenantId = tenantId;
  if (authedReq.user) authedReq.user.tenantId = tenantId;
}

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;
    if (authedReq.user?.id) {
      const tenantId = await resolveTenantId(
        req,
        authedReq.user.id,
        authedReq.tenantId || authedReq.user.tenantId,
      );
      attachValidatedTenant(authedReq, tenantId);
      return runInTenantContext(req, tenantId, next);
    }

    const verified = await verifyRequestSession(req, res);
    if (!verified) return;
    const { payload, activeUser } = verified;
    attachUser(authedReq, payload, activeUser);
    const tenantId = await resolveTenantId(
      req,
      activeUser.id,
      typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    );
    attachValidatedTenant(authedReq, tenantId);
    return runInTenantContext(req, tenantId, next);
  } catch (error) {
    log.error("Auth middleware failed", { error: getErrorMessage(error), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      code: "AUTH_CHECK_FAILED",
      requestId: res.locals?.requestId,
    });
  }
}

export async function authenticateEventStream(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;
    if (authedReq.user?.id) {
      const tenantId = await resolveTenantId(
        req,
        authedReq.user.id,
        authedReq.tenantId || authedReq.user.tenantId,
      );
      attachValidatedTenant(authedReq, tenantId);
      return runInTenantContext(req, tenantId, next);
    }

    if (isProductionRuntime() && typeof req.query.token === "string" && req.query.token) {
      return res.status(401).json({
        error: "Query token authentication is not supported. Use session cookies.",
        code: "SSE_QUERY_TOKEN_DEPRECATED",
        requestId: res.locals?.requestId,
      });
    }
    if (!getSessionTokenFromRequest(req) && typeof req.query.token === "string") {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }

    const verified = await verifyRequestSession(req, res);
    if (!verified) return;
    const { payload, activeUser } = verified;
    attachUser(authedReq, payload, activeUser);
    const tenantId = await resolveTenantId(
      req,
      activeUser.id,
      typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    );
    attachValidatedTenant(authedReq, tenantId);
    return runInTenantContext(req, tenantId, next);
  } catch (error) {
    log.error("SSE auth middleware failed", { error: getErrorMessage(error), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      code: "AUTH_CHECK_FAILED",
      requestId: res.locals?.requestId,
    });
  }
}
