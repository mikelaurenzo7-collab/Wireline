/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import { auditLogger, log } from "../lib/server-context";
import { rateLimit, distributedLimiterStatus } from "../lib/rate-limit";

function isTestEnv() {
  return process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "true";
}

function auditRateLimitExceeded(params: {
  userId?: string;
  resource: string;
  ip?: string;
  metadata?: Record<string, any>;
}) {
  void auditLogger
    .logSecurity("rate_limit_exceeded", params)
    .catch((e: unknown) => log.warn("audit log failed", { error: String(e) }));
}

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
const SIGNIN_RATE_WINDOW_MS = 15 * 60_000;
const SIGNIN_RATE_MAX = 5;
const SIGNUP_RATE_WINDOW_MS = 15 * 60_000;
const SIGNUP_RATE_MAX = 3;
const FORGOT_PASSWORD_RATE_WINDOW_MS = 15 * 60_000;
const FORGOT_PASSWORD_RATE_MAX = 3;
const RESEND_VERIFICATION_RATE_WINDOW_MS = 15 * 60_000;
const RESEND_VERIFICATION_RATE_MAX = 3;
const RESET_PASSWORD_RATE_WINDOW_MS = 15 * 60_000;
const RESET_PASSWORD_RATE_MAX = 5;
const MIGRATE_SESSION_RATE_WINDOW_MS = 15 * 60_000;
const MIGRATE_SESSION_RATE_MAX = 10;

export async function emailRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "email",
    windowMs: EMAIL_RATE_WINDOW_MS,
    max: EMAIL_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ userId, resource: "email_api", ip: req.ip });
    return res.status(429).json({ error: "Email rate limit exceeded.", code: "EMAIL_RATE_LIMIT" });
  }
  next();
}

export async function dialRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const status = distributedLimiterStatus();
  if (!status.ok) return res.status(503).json({ error: status.reason, code: status.code });
  const result = await rateLimit(userId, {
    bucket: "outbound_dial",
    windowMs: DIAL_RATE_WINDOW_MS,
    max: DIAL_RATE_MAX,
    failClosedOnError: true,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ userId, resource: "outbound_dial", ip: req.ip });
    return res.status(429).json({ error: "Dial rate limit exceeded.", code: "DIAL_RATE_LIMIT" });
  }
  next();
}

export function oauthRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const key = req.ip || "anon";
  rateLimit(key, { bucket: "oauth", windowMs: OAUTH_RATE_WINDOW_MS, max: OAUTH_RATE_MAX })
    .then((result) => {
      if (!result.allowed) {
        return res
          .status(429)
          .json({ error: "Too many OAuth requests.", code: "OAUTH_RATE_LIMIT" });
      }
      next();
    })
    .catch(next);
}

export async function knowledgeRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "knowledge",
    windowMs: KNOWLEDGE_RATE_WINDOW_MS,
    max: KNOWLEDGE_RATE_MAX,
  });
  if (!result.allowed) {
    return res
      .status(429)
      .json({ error: "Knowledge rate limit exceeded.", code: "KNOWLEDGE_RATE_LIMIT" });
  }
  next();
}

export async function signinRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `signin:${email}:${ip}` : `signin:anon:${ip}`;
  const result = await rateLimit(key, {
    bucket: "signin",
    windowMs: SIGNIN_RATE_WINDOW_MS,
    max: SIGNIN_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({
      resource: "auth_signin",
      ip: req.ip,
      metadata: email ? { email } : undefined,
    });
    res.setHeader("Retry-After", Math.ceil(SIGNIN_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many sign-in attempts. Wait 15 minutes and try again.",
      code: "SIGNIN_RATE_LIMIT",
    });
  }
  next();
}

export async function signupRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const ip = req.ip || "anon";
  const key = `signup:${ip}`;
  const result = await rateLimit(key, {
    bucket: "signup",
    windowMs: SIGNUP_RATE_WINDOW_MS,
    max: SIGNUP_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ resource: "auth_signup", ip: req.ip });
    res.setHeader("Retry-After", Math.ceil(SIGNUP_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many signup attempts. Wait 15 minutes and try again.",
      code: "SIGNUP_RATE_LIMIT",
    });
  }
  next();
}

export async function forgotPasswordRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `forgotpw:${email}:${ip}` : `forgotpw:anon:${ip}`;
  const result = await rateLimit(key, {
    bucket: "forgot_password",
    windowMs: FORGOT_PASSWORD_RATE_WINDOW_MS,
    max: FORGOT_PASSWORD_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({
      resource: "auth_forgot_password",
      ip: req.ip,
      metadata: email ? { email } : undefined,
    });
    res.setHeader("Retry-After", Math.ceil(FORGOT_PASSWORD_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many password reset requests. Wait 15 minutes and try again.",
      code: "FORGOT_PASSWORD_RATE_LIMIT",
    });
  }
  next();
}

export async function resendVerificationRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const ip = req.ip || "anon";
  const result = await rateLimit(`verify:${userId}:${ip}`, {
    bucket: "resend_verification",
    windowMs: RESEND_VERIFICATION_RATE_WINDOW_MS,
    max: RESEND_VERIFICATION_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ userId, resource: "auth_resend_verification", ip: req.ip });
    res.setHeader("Retry-After", Math.ceil(RESEND_VERIFICATION_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many verification email requests. Wait 15 minutes and try again.",
      code: "RESEND_VERIFICATION_RATE_LIMIT",
    });
  }
  next();
}

export async function migrateSessionRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const ip = req.ip || "anon";
  const key = `migrate_session:${ip}`;
  const result = await rateLimit(key, {
    bucket: "migrate_session",
    windowMs: MIGRATE_SESSION_RATE_WINDOW_MS,
    max: MIGRATE_SESSION_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ resource: "auth_migrate_session", ip: req.ip });
    res.setHeader("Retry-After", Math.ceil(MIGRATE_SESSION_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many session migration attempts. Wait 15 minutes and try again.",
      code: "MIGRATE_SESSION_RATE_LIMIT",
    });
  }
  next();
}

export async function resetPasswordRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const ip = req.ip || "anon";
  const key = `resetpw:${ip}`;
  const result = await rateLimit(key, {
    bucket: "reset_password",
    windowMs: RESET_PASSWORD_RATE_WINDOW_MS,
    max: RESET_PASSWORD_RATE_MAX,
  });
  if (!result.allowed) {
    auditRateLimitExceeded({ resource: "auth_reset_password", ip: req.ip });
    res.setHeader("Retry-After", Math.ceil(RESET_PASSWORD_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many password reset attempts. Wait 15 minutes and try again.",
      code: "RESET_PASSWORD_RATE_LIMIT",
    });
  }
  next();
}

export async function phoneNumberRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "phone_numbers",
    windowMs: PHONE_NUMBER_RATE_WINDOW_MS,
    max: PHONE_NUMBER_RATE_MAX,
  });
  if (!result.allowed) {
    return res
      .status(429)
      .json({ error: "Phone number rate limit exceeded.", code: "PHONE_NUMBER_RATE_LIMIT" });
  }
  next();
}
