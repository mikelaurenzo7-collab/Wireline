import type { Request, Response, NextFunction } from "express";
import type { User } from "../types/auth";
import { log, auditLogger, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifyInternalJwt } from "../lib/auth-utils";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { getSessionTokenFromRequest, isProductionRuntime } from "../lib/session-cookie";

/**
 * Express Request with an attached sovereign User.
 */
interface AuthedReq extends Request {
  user?: User;
  tenantId?: string;
}

/**
 * Launch-safe tenant resolution.
 *
 * The RLS layer uses tenantStore to set app.current_user_id. Accepting an
 * arbitrary x-wireline-tenant-id header before team/workspace membership is
 * verified would let a malicious client request another tenant context. Until
 * true org membership checks exist, the only valid tenant is the authenticated
 * user id. A same-id header is harmless and kept for internal compatibility.
 */
function resolveTenantId(req: Request, userId: string): string {
  const requested = req.get("x-wireline-tenant-id")?.trim();
  if (!requested || requested === userId) return userId;
  log.warn("Ignoring unverified tenant header", {
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

/**
 * Basic authentication middleware.
 * Verifies the sovereign JWT against the internal secret.
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;

    // Idempotent check
    if (authedReq.user?.id) {
      authedReq.tenantId = authedReq.tenantId || resolveTenantId(req, authedReq.user.id);
      return runInTenantContext(req, authedReq.tenantId, next);
    }

    const token = getSessionTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        error: "No authorization token provided",
        code: "AUTH_REQUIRED",
        requestId: res.locals?.requestId,
      });
    }

    let secret: string;
    try {
      secret = requireInternalJwtSecret();
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg.includes("JWT_SECRET_NOT_CONFIGURED") || msg.includes("JWT_SECRET_CONFLICT")) {
        log.error("Auth middleware: JWT secret misconfigured", { error: msg });
        return res.status(503).json({
          error: "Authentication is temporarily unavailable. Platform configuration is incomplete.",
          code: "AUTH_NOT_CONFIGURED",
          requestId: res.locals?.requestId,
        });
      }
      throw e;
    }

    const payload = await verifyInternalJwt(token, secret);

    if (!payload) {
      // Audit log: invalid/expired token (non-blocking)
      void auditLogger
        .logAuth("failed_login", {
          email: req.body?.email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
          reason: !token ? "missing_token" : "invalid_token",
          requestId: res.locals?.requestId,
        })
        .catch((err: unknown) => log.warn("audit log failed", { error: getErrorMessage(err) }));

      return res.status(401).json({
        error: "Invalid or expired session",
        code: "AUTH_INVALID",
        requestId: res.locals?.requestId,
      });
    }

    // Map JWT payload to a compatible User object
    authedReq.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "authenticated",
      aud: payload.aud,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as User;

    // NOTE: We deliberately do NOT emit a logAuth('login') here.
    // authenticateUser runs on every authenticated API request — logging
    // every bearer-token validation as "auth.login" would flood the audit
    // log with thousands of rows per day, all semantically wrong (a login
    // is when a new session is *created*, not when an existing JWT is
    // *verified*). Real sign-in events are emitted by Wireline's auth
    // system; the audit log captures failed attempts above.

    authedReq.tenantId = resolveTenantId(req, authedReq.user!.id);
    return runInTenantContext(req, authedReq.tenantId, next);
  } catch (e) {
    log.error("Auth middleware failed", { error: getErrorMessage(e), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      code: "AUTH_CHECK_FAILED",
      requestId: res.locals?.requestId,
    });
  }
}

/**
 * Authentication middleware for Server-Sent Events (EventSource) endpoints.
 *
 * Browser clients should use the httpOnly `wireline_session` cookie (EventSource
 * sends cookies on same-origin requests). In development, `?token=` is still
 * accepted for local debugging. In production, query tokens are rejected.
 */
export async function authenticateEventStream(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;

    if (authedReq.user?.id) {
      authedReq.tenantId = authedReq.tenantId || resolveTenantId(req, authedReq.user.id);
      return runInTenantContext(req, authedReq.tenantId, next);
    }

    if (isProductionRuntime() && typeof req.query.token === "string" && req.query.token) {
      return res.status(401).json({
        error: "Query token authentication is not supported. Use session cookies.",
        code: "SSE_QUERY_TOKEN_DEPRECATED",
        requestId: res.locals?.requestId,
      });
    }

    const token =
      getSessionTokenFromRequest(req) ||
      (typeof req.query.token === "string" ? req.query.token : undefined);

    if (!token) {
      return res.status(401).json({
        error: "No authorization token provided",
        code: "AUTH_REQUIRED",
        requestId: res.locals?.requestId,
      });
    }

    let secret: string;
    try {
      secret = requireInternalJwtSecret();
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg.includes("JWT_SECRET_NOT_CONFIGURED") || msg.includes("JWT_SECRET_CONFLICT")) {
        log.error("SSE auth middleware: JWT secret misconfigured", { error: msg });
        return res.status(503).json({
          error: "Authentication is temporarily unavailable. Platform configuration is incomplete.",
          code: "AUTH_NOT_CONFIGURED",
          requestId: res.locals?.requestId,
        });
      }
      throw e;
    }

    const payload = await verifyInternalJwt(token, secret);

    if (!payload) {
      return res.status(401).json({
        error: "Invalid or expired session",
        code: "AUTH_INVALID",
        requestId: res.locals?.requestId,
      });
    }

    authedReq.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "authenticated",
      aud: payload.aud,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as User;

    authedReq.tenantId = resolveTenantId(req, authedReq.user!.id);
    return runInTenantContext(req, authedReq.tenantId, next);
  } catch (e) {
    log.error("SSE auth middleware failed", { error: getErrorMessage(e), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      code: "AUTH_CHECK_FAILED",
      requestId: res.locals?.requestId,
    });
  }
}
