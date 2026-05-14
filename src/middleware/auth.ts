import * as Sentry from "@sentry/node";
import type { Request, Response, NextFunction } from "express";
import type { User } from "@supabase/supabase-js";
import { log, auditLogger } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { verifySupabaseJwt } from "../lib/auth-utils";

/**
 * Express Request with an attached Supabase User.
 *
 * After `authenticateUser` succeeds, downstream handlers can safely cast
 * `req` to this shape. The canonical `AuthenticatedRequest` in
 * `src/types/auth.ts` extends this with the optional RBAC `role` field;
 * this lighter version avoids a circular-dependency edge between
 * middleware ↔ lib/soc2-controls.
 */
interface AuthedReq extends Request {
  user?: User;
}

/**
 * Basic authentication middleware.
 * Verifies the Bearer token against Supabase Auth.
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authedReq = req as AuthedReq;

  // Idempotent: if an upstream middleware already authenticated this
  // request (e.g. the /api/claude scope runs auth before the spend cap
  // and audit middleware), skip the redundant Supabase round-trip.
  if (authedReq.user?.id) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
     // Audit log: missing auth header (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: 'missing_token',
       requestId: res.locals?.requestId,
     }).catch((err: unknown) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "No authorization header provided" });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  const payload = await verifySupabaseJwt(token, secret);

  if (!payload) {
     // Audit log: invalid/expired token (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: !token ? 'missing_token' : 'invalid_token',
       requestId: res.locals?.requestId,
     }).catch((err: unknown) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "Invalid or expired session" });
  }

  // Map JWT payload to a compatible User object
  const user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role || 'authenticated',
    aud: payload.aud,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(payload.iat * 1000).toISOString(),
  } as any;

  authedReq.user = user;

  // Attach user context to Sentry
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });

  // NOTE: We deliberately do NOT emit a logAuth('login') here.
  // authenticateUser runs on every authenticated API request — logging
  // every bearer-token validation as "auth.login" would flood the audit
  // log with thousands of rows per day, all semantically wrong (a login
  // is when a new session is *created*, not when an existing JWT is
  // *verified*). Real sign-in events are emitted by Supabase's own auth
  // system; the audit log captures failed attempts above.

  next();
}
