import * as Sentry from "@sentry/node";
import { db, log, auditLogger } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

/**
 * Basic authentication middleware.
 * Verifies the Bearer token against Supabase Auth.
 */
export async function authenticateUser(req: any, res: any, next: any) {
  // Idempotent: if an upstream middleware already authenticated this
  // request (e.g. the /api/claude scope runs auth before the spend cap
  // and audit middleware), skip the redundant Supabase round-trip.
  if (req.user?.id) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
     // Audit log: missing auth header (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: 'missing_token',
       requestId: res.locals?.requestId,
     }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "No authorization header provided" });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await db.auth.getUser(token);

  if (error || !user) {
     // Audit log: invalid/expired token (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: !token ? 'missing_token' : 'invalid_token',
       requestId: res.locals?.requestId,
     }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;

  // Attach user context to Sentry for all subsequent events (errors, metrics, etc.)
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
