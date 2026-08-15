/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import { auditLogger, log } from "../lib/server-context";
import { rateLimit, peekRateLimit, distributedLimiterStatus } from "../lib/rate-limit";

function isTestEnv() {
  return process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "true";
}

/**
 * Credential-stuffing defense depends on a SHARED counter. Without a
 * distributed limiter (Upstash), rateLimit() silently degrades to a
 * per-invocation in-memory Map — on Vercel every request is a fresh process,
 * so signin/signup/forgot-password limits become effectively unlimited. The
 * old `failClosedOnError` flag only caught Redis *errors*, not Redis
 * *absence*. This refuses auth attempts in production when no distributed
 * limiter is configured, exactly as the spend-sensitive buckets already do
 * (single-node deployments opt in with WIRELINE_ALLOW_INMEMORY_RATE_LIMIT).
 * Returns true when it has already sent a 503.
 */
function refusedForNoDistributedLimiter(res: any): boolean {
  const status = distributedLimiterStatus();
  if (status.ok) return false;
  res.status(503).json({
    error: "Authentication is temporarily unavailable. Try again shortly.",
    code: status.code || "RATE_LIMITER_UNAVAILABLE",
  });
  return true;
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

export function oauthRateLimiter(req: any, res: any, next: any) {
  res.locals ||= {};
  if (res.locals.oauthRateLimitChecked === true) return next();
  if (isTestEnv()) {
    res.locals.oauthRateLimitChecked = true;
    return next();
  }
  if (refusedForNoDistributedLimiter(res)) return;

  const key = req.ip || "anon";
  rateLimit(key, {
    bucket: "oauth",
    windowMs: OAUTH_RATE_WINDOW_MS,
    max: OAUTH_RATE_MAX,
    failClosedOnError: process.env.NODE_ENV === "production",
  })
    .then((result) => {
      if (!result.allowed) {
        auditRateLimitExceeded({ resource: "auth_oauth", ip: req.ip });
        res.setHeader("Retry-After", Math.ceil(OAUTH_RATE_WINDOW_MS / 1000));
        return res
          .status(429)
          .json({ error: "Too many OAuth requests.", code: "OAUTH_RATE_LIMIT" });
      }
      res.locals.oauthRateLimitChecked = true;
      next();
    })
    .catch(() =>
      res.status(503).json({
        error: "OAuth sign-in is temporarily unavailable. Try again shortly.",
        code: "RATE_LIMIT_UNAVAILABLE",
      }),
    );
}

function authRateLimitOptions(bucket: string, windowMs: number, max: number) {
  return {
    bucket,
    windowMs,
    max,
    failClosedOnError: process.env.NODE_ENV === "production",
  };
}

/**
 * Failure-only budgets that bound the two dimensions the per-(email, IP) key
 * does not.
 *
 * That key limits repeat attempts against ONE address from one host. Password
 * spraying and credential stuffing both vary the email, so every attempt lands
 * in a fresh bucket and nothing is bounded — one host can try one password
 * against fifty thousand addresses without ever seeing a 429, and because the
 * only writer of `rate_limit_exceeded` audit rows is the 429 path, the sweep
 * leaves no security signal either.
 *
 * Counted on FAILURE only. A shared-NAT office whose people sign in correctly
 * never touches these buckets; an attacker guessing wrong does, immediately.
 */
const SIGNIN_IP_FAILURE_MAX = 50;
const SIGNIN_EMAIL_FAILURE_MAX = 20;

function signinFailureIpKey(ip: string) {
  return `signin_fail_ip:${ip}`;
}

function signinFailureEmailKey(email: string) {
  return `signin_fail_email:${email}`;
}

/**
 * Record one failed sign-in against the failure budgets. Called from the 401
 * path so only wrong credentials cost anything. Best-effort: a limiter outage
 * must never turn a failed password into a 500.
 */
export async function recordSigninFailure(ip: string, email: string): Promise<void> {
  const normalizedIp = ip || "anon";
  try {
    await rateLimit(
      signinFailureIpKey(normalizedIp),
      authRateLimitOptions("signin_fail_ip", SIGNIN_RATE_WINDOW_MS, SIGNIN_IP_FAILURE_MAX),
    );
    if (email) {
      await rateLimit(
        signinFailureEmailKey(email),
        authRateLimitOptions("signin_fail_email", SIGNIN_RATE_WINDOW_MS, SIGNIN_EMAIL_FAILURE_MAX),
      );
    }
  } catch {
    /* the throttle is defense in depth; never fail the request on it */
  }
}

export async function signinRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  if (refusedForNoDistributedLimiter(res)) return;
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `signin:${email}:${ip}` : `signin:anon:${ip}`;
  try {
    // Peek, never increment: these budgets are spent by failures only.
    const [ipBudget, emailBudget] = await Promise.all([
      peekRateLimit(
        signinFailureIpKey(ip),
        authRateLimitOptions("signin_fail_ip", SIGNIN_RATE_WINDOW_MS, SIGNIN_IP_FAILURE_MAX),
      ),
      email
        ? peekRateLimit(
            signinFailureEmailKey(email),
            authRateLimitOptions(
              "signin_fail_email",
              SIGNIN_RATE_WINDOW_MS,
              SIGNIN_EMAIL_FAILURE_MAX,
            ),
          )
        : Promise.resolve({ allowed: true, remaining: 0, resetMs: 0 }),
    ]);
    if (!ipBudget.allowed || !emailBudget.allowed) {
      auditRateLimitExceeded({
        resource: !ipBudget.allowed ? "auth_signin_ip" : "auth_signin_email",
        ip: req.ip,
        metadata: email ? { email } : undefined,
      });
      res.setHeader("Retry-After", Math.ceil(SIGNIN_RATE_WINDOW_MS / 1000));
      return res.status(429).json({
        error: "Too many sign-in attempts. Wait 15 minutes and try again.",
        code: "SIGNIN_RATE_LIMIT",
      });
    }

    const result = await rateLimit(
      key,
      authRateLimitOptions("signin", SIGNIN_RATE_WINDOW_MS, SIGNIN_RATE_MAX),
    );
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
  } catch {
    return res.status(503).json({
      error: "Sign-in is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}

export async function signupRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  if (refusedForNoDistributedLimiter(res)) return;
  const ip = req.ip || "anon";
  const key = `signup:${ip}`;
  try {
    const result = await rateLimit(
      key,
      authRateLimitOptions("signup", SIGNUP_RATE_WINDOW_MS, SIGNUP_RATE_MAX),
    );
    if (!result.allowed) {
      auditRateLimitExceeded({ resource: "auth_signup", ip: req.ip });
      res.setHeader("Retry-After", Math.ceil(SIGNUP_RATE_WINDOW_MS / 1000));
      return res.status(429).json({
        error: "Too many signup attempts. Wait 15 minutes and try again.",
        code: "SIGNUP_RATE_LIMIT",
      });
    }
    next();
  } catch {
    return res.status(503).json({
      error: "Signup is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}

export async function forgotPasswordRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  if (refusedForNoDistributedLimiter(res)) return;
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `forgotpw:${email}:${ip}` : `forgotpw:anon:${ip}`;
  try {
    const result = await rateLimit(key, {
      bucket: "forgot_password",
      windowMs: FORGOT_PASSWORD_RATE_WINDOW_MS,
      max: FORGOT_PASSWORD_RATE_MAX,
      failClosedOnError: process.env.NODE_ENV === "production",
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
  } catch {
    return res.status(503).json({
      error: "Password reset is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}

export async function resendVerificationRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  // Same fail-closed posture as the auth-entry buckets: without a distributed
  // limiter this bucket would silently degrade to a per-invocation Map (no
  // real limit on Vercel), so refuse in production when none is configured.
  if (refusedForNoDistributedLimiter(res)) return;
  const ip = req.ip || "anon";
  try {
    const result = await rateLimit(
      `verify:${userId}:${ip}`,
      authRateLimitOptions(
        "resend_verification",
        RESEND_VERIFICATION_RATE_WINDOW_MS,
        RESEND_VERIFICATION_RATE_MAX,
      ),
    );
    if (!result.allowed) {
      auditRateLimitExceeded({ userId, resource: "auth_resend_verification", ip: req.ip });
      res.setHeader("Retry-After", Math.ceil(RESEND_VERIFICATION_RATE_WINDOW_MS / 1000));
      return res.status(429).json({
        error: "Too many verification email requests. Wait 15 minutes and try again.",
        code: "RESEND_VERIFICATION_RATE_LIMIT",
      });
    }
    next();
  } catch {
    return res.status(503).json({
      error: "Verification email is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}

export async function migrateSessionRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  if (refusedForNoDistributedLimiter(res)) return;
  const ip = req.ip || "anon";
  const key = `migrate_session:${ip}`;
  try {
    const result = await rateLimit(
      key,
      authRateLimitOptions(
        "migrate_session",
        MIGRATE_SESSION_RATE_WINDOW_MS,
        MIGRATE_SESSION_RATE_MAX,
      ),
    );
    if (!result.allowed) {
      auditRateLimitExceeded({ resource: "auth_migrate_session", ip: req.ip });
      res.setHeader("Retry-After", Math.ceil(MIGRATE_SESSION_RATE_WINDOW_MS / 1000));
      return res.status(429).json({
        error: "Too many session migration attempts. Wait 15 minutes and try again.",
        code: "MIGRATE_SESSION_RATE_LIMIT",
      });
    }
    next();
  } catch {
    return res.status(503).json({
      error: "Session migration is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}

export async function resetPasswordRateLimiter(req: any, res: any, next: any) {
  if (isTestEnv()) return next();
  if (refusedForNoDistributedLimiter(res)) return;
  const ip = req.ip || "anon";
  const key = `resetpw:${ip}`;
  try {
    const result = await rateLimit(
      key,
      authRateLimitOptions(
        "reset_password",
        RESET_PASSWORD_RATE_WINDOW_MS,
        RESET_PASSWORD_RATE_MAX,
      ),
    );
    if (!result.allowed) {
      auditRateLimitExceeded({ resource: "auth_reset_password", ip: req.ip });
      res.setHeader("Retry-After", Math.ceil(RESET_PASSWORD_RATE_WINDOW_MS / 1000));
      return res.status(429).json({
        error: "Too many password reset attempts. Wait 15 minutes and try again.",
        code: "RESET_PASSWORD_RATE_LIMIT",
      });
    }
    next();
  } catch {
    return res.status(503).json({
      error: "Password reset is temporarily unavailable. Try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }
}
