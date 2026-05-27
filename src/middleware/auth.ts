/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import type { Request, Response, NextFunction } from "express";
import type { User } from "../types/auth";
import { log, auditLogger } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifySupabaseJwt as verifyInternalJwt } from "../lib/auth-utils";
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
    if (authedReq.user?.id) return next();

    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.["wireline_session"];
    const token = authHeader?.split(" ")[1] || cookieToken;

    if (!token) {
      return res.status(401).json({ error: "No authorization token provided" });
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

      return res.status(401).json({ error: "Invalid or expired session" });
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

    return next();
  } catch (e) {
    log.error("Auth middleware failed", { error: getErrorMessage(e), path: req.path });
    return res.status(500).json({
      error: "Authentication check failed",
      requestId: res.locals?.requestId,
    });
  }
}
