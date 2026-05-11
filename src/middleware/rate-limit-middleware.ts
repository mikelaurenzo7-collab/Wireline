import { log, auditLogger, quotaTracker } from "../lib/server-context";
import { rateLimit, distributedLimiterStatus } from "../lib/rate-limit";
import { SentryEvents } from "../lib/sentry-events";
import { getErrorMessage } from "../lib/server-utils";
import { claudeRateLimiter } from "./api-rate-limits";

const OAUTH_RATE_WINDOW_MS = 5 * 60_000;
const OAUTH_RATE_MAX = 10;
const EMAIL_RATE_WINDOW_MS = 60_000;
const EMAIL_RATE_MAX = 20;
const KNOWLEDGE_RATE_WINDOW_MS = 60_000;
const KNOWLEDGE_RATE_MAX = 100;
const PHONE_NUMBER_RATE_WINDOW_MS = 60_000;
const PHONE_NUMBER_RATE_MAX = 10;
const DIAL_RATE_WINDOW_MS = 60_000;
const DIAL_RATE_MAX = 30;

export async function emailRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, { bucket: "email", windowMs: EMAIL_RATE_WINDOW_MS, max: EMAIL_RATE_MAX });
  if (!result.allowed) {
    void auditLogger.logSecurity('rate_limit_exceeded', { userId, resource: 'email_api', ip: req.ip }).catch(() => {});
    return res.status(429).json({ error: "Email rate limit exceeded.", code: "EMAIL_RATE_LIMIT" });
  }
  next();
}

export async function dialRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const status = distributedLimiterStatus();
  if (!status.ok) return res.status(503).json({ error: status.reason, code: status.code });
  const result = await rateLimit(userId, { bucket: "outbound_dial", windowMs: DIAL_RATE_WINDOW_MS, max: DIAL_RATE_MAX, failClosedOnError: true });
  if (!result.allowed) {
    void auditLogger.logSecurity('rate_limit_exceeded', { userId, resource: 'outbound_dial', ip: req.ip }).catch(() => {});
    return res.status(429).json({ error: "Dial rate limit exceeded.", code: "DIAL_RATE_LIMIT" });
  }
  next();
}

export function oauthRateLimiter(req: any, res: any, next: any) {
  const key = req.ip || "anon";
  rateLimit(key, { bucket: "oauth", windowMs: OAUTH_RATE_WINDOW_MS, max: OAUTH_RATE_MAX }).then((result) => {
    if (!result.allowed) return res.status(429).json({ error: "Too many OAuth requests.", code: "OAUTH_RATE_LIMIT" });
    next();
  }).catch(next);
}

export async function knowledgeRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, { bucket: "knowledge", windowMs: KNOWLEDGE_RATE_WINDOW_MS, max: KNOWLEDGE_RATE_MAX });
  if (!result.allowed) return res.status(429).json({ error: "Knowledge rate limit exceeded.", code: "KNOWLEDGE_RATE_LIMIT" });
  next();
}

export async function phoneNumberRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, { bucket: "phone_numbers", windowMs: PHONE_NUMBER_RATE_WINDOW_MS, max: PHONE_NUMBER_RATE_MAX });
  if (!result.allowed) return res.status(429).json({ error: "Phone number rate limit exceeded.", code: "PHONE_NUMBER_RATE_LIMIT" });
  next();
}
