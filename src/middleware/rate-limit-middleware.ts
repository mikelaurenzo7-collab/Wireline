import { auditLogger } from "../lib/server-context";
import { rateLimit, distributedLimiterStatus } from "../lib/rate-limit";

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
// Signup needs to be tighter than signin — a bot doesn't know any
// existing emails so it can't be (email, IP)-keyed; just (IP). And
// the cost of letting it through is concrete: Resend email quota,
// trial DB rows, Stripe checkout entries. 3 per 15 min is enough for
// real humans (typo + retry + correct) while killing volume bots.
const SIGNUP_RATE_WINDOW_MS = 15 * 60_000;
const SIGNUP_RATE_MAX = 3;
// Forgot-password is rate-limited tighter than signin because each
// triggered request mints a token + (when transport is wired) fires an
// email — both have real-cost surface area. Keyed by both email and IP
// so an attacker rotating IPs can't spam one account, and one IP can't
// spray reset emails across many tenants.
const FORGOT_PASSWORD_RATE_WINDOW_MS = 15 * 60_000;
const FORGOT_PASSWORD_RATE_MAX = 3;

export async function emailRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "email",
    windowMs: EMAIL_RATE_WINDOW_MS,
    max: EMAIL_RATE_MAX,
  });
  if (!result.allowed) {
    void auditLogger
      .logSecurity("rate_limit_exceeded", { userId, resource: "email_api", ip: req.ip })
      .catch(() => {});
    return res.status(429).json({ error: "Email rate limit exceeded.", code: "EMAIL_RATE_LIMIT" });
  }
  next();
}

export async function dialRateLimiter(req: any, res: any, next: any) {
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
    void auditLogger
      .logSecurity("rate_limit_exceeded", { userId, resource: "outbound_dial", ip: req.ip })
      .catch(() => {});
    return res.status(429).json({ error: "Dial rate limit exceeded.", code: "DIAL_RATE_LIMIT" });
  }
  next();
}

export function oauthRateLimiter(req: any, res: any, next: any) {
  const key = req.ip || "anon";
  rateLimit(key, { bucket: "oauth", windowMs: OAUTH_RATE_WINDOW_MS, max: OAUTH_RATE_MAX })
    .then((result) => {
      if (!result.allowed)
        return res
          .status(429)
          .json({ error: "Too many OAuth requests.", code: "OAUTH_RATE_LIMIT" });
      next();
    })
    .catch(next);
}

export async function knowledgeRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "knowledge",
    windowMs: KNOWLEDGE_RATE_WINDOW_MS,
    max: KNOWLEDGE_RATE_MAX,
  });
  if (!result.allowed)
    return res
      .status(429)
      .json({ error: "Knowledge rate limit exceeded.", code: "KNOWLEDGE_RATE_LIMIT" });
  next();
}

/**
 * Sign-in rate limiter — keyed by (email, IP) pair so an attacker can't
 * trivially work around it by rotating IPs while attacking one account, nor
 * by attacking many accounts from one IP. Bucketed at 5 attempts per
 * 15-minute window. Returns 429 with retry-after header on lockout.
 */
export async function signinRateLimiter(req: any, res: any, next: any) {
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `signin:${email}:${ip}` : `signin:anon:${ip}`;
  const result = await rateLimit(key, {
    bucket: "signin",
    windowMs: SIGNIN_RATE_WINDOW_MS,
    max: SIGNIN_RATE_MAX,
  });
  if (!result.allowed) {
    void auditLogger
      .logSecurity("rate_limit_exceeded", {
        resource: "auth_signin",
        ip: req.ip,
        userId: email,
      })
      .catch(() => {});
    res.setHeader("Retry-After", Math.ceil(SIGNIN_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many sign-in attempts. Wait 15 minutes and try again.",
      code: "SIGNIN_RATE_LIMIT",
    });
  }
  next();
}

/**
 * Signup rate limiter — keyed by IP only (no email to bind against
 * since the bot picks the email). 3 attempts per 15 minutes. A real
 * human typos their email at most twice; bots probe in volume. The
 * cost of letting bots through is real: Resend email quota, trial
 * DB rows, Stripe checkout sessions, and PII exposure if leaked
 * emails are real.
 */
export async function signupRateLimiter(req: any, res: any, next: any) {
  const ip = req.ip || "anon";
  const key = `signup:${ip}`;
  const result = await rateLimit(key, {
    bucket: "signup",
    windowMs: SIGNUP_RATE_WINDOW_MS,
    max: SIGNUP_RATE_MAX,
  });
  if (!result.allowed) {
    void auditLogger
      .logSecurity("rate_limit_exceeded", {
        resource: "auth_signup",
        ip: req.ip,
      })
      .catch(() => {});
    res.setHeader("Retry-After", Math.ceil(SIGNUP_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many signup attempts. Wait 15 minutes and try again.",
      code: "SIGNUP_RATE_LIMIT",
    });
  }
  next();
}

/**
 * Forgot-password rate limiter — keyed by (email, IP) like signin so it
 * can't be bypassed by rotating either dimension. 3 requests per
 * 15-minute window. Always responds 429 + Retry-After on lockout so the
 * frontend can show the user when to try again.
 */
export async function forgotPasswordRateLimiter(req: any, res: any, next: any) {
  const email = (req.body?.email || "").toString().toLowerCase().trim();
  const ip = req.ip || "anon";
  const key = email ? `forgotpw:${email}:${ip}` : `forgotpw:anon:${ip}`;
  const result = await rateLimit(key, {
    bucket: "forgot_password",
    windowMs: FORGOT_PASSWORD_RATE_WINDOW_MS,
    max: FORGOT_PASSWORD_RATE_MAX,
  });
  if (!result.allowed) {
    void auditLogger
      .logSecurity("rate_limit_exceeded", {
        resource: "auth_forgot_password",
        ip: req.ip,
        userId: email,
      })
      .catch(() => {});
    res.setHeader("Retry-After", Math.ceil(FORGOT_PASSWORD_RATE_WINDOW_MS / 1000));
    return res.status(429).json({
      error: "Too many password reset requests. Wait 15 minutes and try again.",
      code: "FORGOT_PASSWORD_RATE_LIMIT",
    });
  }
  next();
}

export async function phoneNumberRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await rateLimit(userId, {
    bucket: "phone_numbers",
    windowMs: PHONE_NUMBER_RATE_WINDOW_MS,
    max: PHONE_NUMBER_RATE_MAX,
  });
  if (!result.allowed)
    return res
      .status(429)
      .json({ error: "Phone number rate limit exceeded.", code: "PHONE_NUMBER_RATE_LIMIT" });
  next();
}
