import type { Request, Response, NextFunction } from "express";
import type { User } from "../types/auth";
import { log, auditLogger, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifyInternalJwt } from "../lib/auth-utils";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";

/**
 * Express Request with an attached sovereign User.
 */
interface AuthedReq extends Request {
  user?: User;
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
      return tenantStore.getStore() ? next() : tenantStore.run(authedReq.user.id, () => next());
    }

    // Bearer-in-Authorization-header only — Wireline intentionally has no
    // cookie sessions (see README). Accepting a cookie-borne token would add
    // a CSRF surface with no functional benefit (cookie-parser is never wired,
    // so any cookie path was dead code regardless).
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      // SESSION_INVALID lets the SPA distinguish a dead session (sign the
      // user out, bounce to /signin) from an endpoint-specific 401. See
      // maybeDispatchSessionExpiredEvent in src/lib/api.ts.
      return res
        .status(401)
        .json({ error: "No authorization token provided", code: "SESSION_INVALID" });
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

      return res.status(401).json({ error: "Invalid or expired session", code: "SESSION_INVALID" });
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

    return tenantStore.run(authedReq.user!.id, () => next());
  } catch (e) {
    log.error("Auth middleware failed", { error: getErrorMessage(e), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      requestId: res.locals?.requestId,
    });
  }
}

/**
 * Authentication middleware for Server-Sent Events (EventSource) endpoints.
 *
 * The browser `EventSource` API cannot attach an `Authorization` header, so SSE
 * streams must carry the bearer token as a `?token=` query parameter instead
 * (mirroring the supervisor WebSocket upgrade in supervisor-websocket-service).
 * An `Authorization` header is still accepted as a fallback for non-browser
 * clients. On success the request is run inside the tenant AsyncLocalStorage
 * scope so downstream queries are RLS-scoped just like `authenticateUser`.
 */
export async function authenticateEventStream(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedReq;

    if (authedReq.user?.id) {
      return tenantStore.getStore() ? next() : tenantStore.run(authedReq.user.id, () => next());
    }

    const headerToken = req.headers.authorization?.split(" ")[1];
    const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
    const token = headerToken || queryToken;

    if (!token) {
      return res
        .status(401)
        .json({ error: "No authorization token provided", code: "SESSION_INVALID" });
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
        });
      }
      throw e;
    }

    const payload = await verifyInternalJwt(token, secret);

    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired session", code: "SESSION_INVALID" });
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

    return tenantStore.run(authedReq.user!.id, () => next());
  } catch (e) {
    log.error("SSE auth middleware failed", { error: getErrorMessage(e), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      requestId: res.locals?.requestId,
    });
  }
}
