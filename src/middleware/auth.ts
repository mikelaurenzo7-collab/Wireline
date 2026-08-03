import type { Request, Response, NextFunction } from "express";
import type { User } from "../types/auth";
import { log, auditLogger, tenantStore, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifyInternalJwt, type JwtPayload } from "../lib/auth-utils";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { getSessionTokenFromRequest, isProductionRuntime } from "../lib/session-cookie";
import { sessionUsers, secureTeamMembers } from "../db/security-schema";
import { and, eq, isNull } from "drizzle-orm";

interface AuthedReq extends Request {
  user?: User;
  tenantId?: string;
}

type ActiveSessionUser = {
  id: string;
  email: string;
  sessionRevokedBefore: Date;
};

function tokenIssuedAtMs(payload: JwtPayload): number {
  const precise = Number(payload.iat_ms);
  if (Number.isFinite(precise) && precise > 0) return precise;
  return payload.iat * 1000;
}

async function loadActiveSessionUser(payload: JwtPayload): Promise<ActiveSessionUser | null> {
  // The signed JWT subject is the only tenant identity available before auth
  // middleware establishes AsyncLocalStorage. Enter that exact RLS context for
  // the revocation lookup; querying with no GUC would hide the user row and
  // incorrectly reject every otherwise-valid session.
  return tenantStore.run(payload.sub, async () => {
    const [user] = await drizzle
      .select({
        id: sessionUsers.id,
        email: sessionUsers.email,
        sessionRevokedBefore: sessionUsers.sessionRevokedBefore,
      })
      .from(sessionUsers)
      .where(eq(sessionUsers.id, payload.sub))
      .limit(1);
    if (!user) return null;
    if (tokenIssuedAtMs(payload) <= user.sessionRevokedBefore.getTime()) return null;
    return user;
  });
}

/**
 * Resolve a tenant only after an active membership check. A tenant embedded in
 * a session token was issued by Wireline after explicit workspace selection;
 * the compatibility header remains accepted only when it resolves to the same
 * verified membership.
 */
async function resolveTenantId(
  req: Request,
  userId: string,
  tokenTenantId?: string,
): Promise<string> {
  const headerTenantId = req.get("x-wireline-tenant-id")?.trim();
  const requested = tokenTenantId?.trim() || headerTenantId;
  if (!requested || requested === userId) return userId;

  // Membership self-read is deliberately available only in the member's own
  // context. Do not query before setting the GUC or RLS will return no row.
  const [membership] = await tenantStore.run(userId, () =>
    drizzle
      .select({ id: secureTeamMembers.id })
      .from(secureTeamMembers)
      .where(
        and(
          eq(secureTeamMembers.tenantId, requested),
          eq(secureTeamMembers.userId, userId),
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

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;
    if (authedReq.user?.id) {
      authedReq.tenantId =
        authedReq.tenantId ||
        (await resolveTenantId(req, authedReq.user.id, authedReq.user.tenantId));
      return runInTenantContext(req, authedReq.tenantId, next);
    }

    const verified = await verifyRequestSession(req, res);
    if (!verified) return;
    const { payload, activeUser } = verified;

    authedReq.user = {
      id: activeUser.id,
      email: activeUser.email,
      role: payload.role || "authenticated",
      aud: payload.aud,
      tenantId: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as User;

    authedReq.tenantId = await resolveTenantId(
      req,
      activeUser.id,
      typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    );
    return runInTenantContext(req, authedReq.tenantId, next);
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
      authedReq.tenantId =
        authedReq.tenantId ||
        (await resolveTenantId(req, authedReq.user.id, authedReq.user.tenantId));
      return runInTenantContext(req, authedReq.tenantId, next);
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

    authedReq.user = {
      id: activeUser.id,
      email: activeUser.email,
      role: payload.role || "authenticated",
      aud: payload.aud,
      tenantId: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as User;

    authedReq.tenantId = await resolveTenantId(
      req,
      activeUser.id,
      typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    );
    return runInTenantContext(req, authedReq.tenantId, next);
  } catch (error) {
    log.error("SSE auth middleware failed", { error: getErrorMessage(error), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      code: "AUTH_CHECK_FAILED",
      requestId: res.locals?.requestId,
    });
  }
}
