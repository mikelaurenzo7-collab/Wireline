import * as Sentry from "@sentry/node";
import { db, log, auditLogger } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

export async function authenticateUser(req: any, res: any, next: any) {
  if (req.user?.id) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
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

  Sentry.setUser({
    id: user.id,
    email: user.email,
  });

  next();
}
