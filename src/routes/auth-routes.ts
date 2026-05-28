/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Request, Response } from "express";
import { authService, AuthConfigurationError } from "../lib/auth-service";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import {
  signinRateLimiter,
  signupRateLimiter,
  forgotPasswordRateLimiter,
  resendVerificationRateLimiter,
} from "../middleware/rate-limit-middleware";
import { sendPasswordResetEmail } from "../lib/email-service";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import {
  validateBody,
  signinSchema,
  signupSchema,
  signupIntentSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../lib/api-validation";
import { getPostgresErrorCode } from "../lib/pg-errors";

const router = Router();

/**
 * POST /api/auth/signin
 * Authenticate a user and return a JWT. Rate-limited 5 attempts / 15 min
 * per (email, IP) pair to slow credential stuffing.
 */
router.post(
  "/api/auth/signin",
  signinRateLimiter,
  validateBody(signinSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      // Body is now validated by Zod middleware

      const result = await authService.signIn(email, password);
      if (!result) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        log.error("Auth: Sign in unavailable — JWT secret missing", { error });
        return res.status(503).json({
          error: "Sign-in is temporarily unavailable. Platform configuration is incomplete.",
          code: "AUTH_NOT_CONFIGURED",
        });
      }
      log.error("Auth: Sign in endpoint failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/auth/signup
 * Register a new user and return a JWT.
 *
 * Duplicate-email handling has TWO layers:
 *   1. Pre-insert SELECT — gives a clean 409 + actionable error message
 *      with no race window in the common case (single client retrying).
 *   2. Post-insert catch on Postgres 23505 — race-condition backstop for
 *      two concurrent signups with the same email. Drizzle wraps pg
 *      errors so the code can live on either `error.code` (older
 *      drivers / unwrapped errors) or `error.cause?.code` (Drizzle's
 *      DrizzleQueryError wrapping in current versions). We check both.
 *
 * Without (2) the same race could leak through as a 500, which is what
 * the May 2026 signup-bug was — single insert path, wrapped error, the
 * 23505 check missed, fell through to "Internal server error".
 */
router.post(
  "/api/auth/signup",
  signupRateLimiter,
  validateBody(signupSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        email,
        password,
        fullName,
        preferredPlanId,
        signupWedge,
        utmSource,
        utmMedium,
        utmCampaign,
      } = req.body;
      // Body is now validated by Zod middleware (email already lowercased + trimmed).

      // Pre-check for existing account — gives a clean 409 with a
      // user-actionable message instead of a confusing 500.
      // (Race-condition backstop lives in the catch block below.)
      const [existing] = await drizzle
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      if (existing) {
        return res.status(409).json({
          error: "An account with this email already exists. Try signing in instead.",
          code: "EMAIL_TAKEN",
        });
      }

      const result = await authService.signUp(email, password, fullName, {
        preferredPlanId,
        signupWedge,
        utmSource,
        utmMedium,
        utmCampaign,
      });

      // Mint + email the verification link. Best-effort: if the
      // transport is down (no RESEND_API_KEY), signup still succeeds
      // but the user lands with email_verified_at = NULL and the
      // banner shows "Resend verification." No silent ok-lies. The
      // user can still poke around the product; the trial gate blocks
      // money-spending actions until verified.
      try {
        const { token } = await authService.createEmailVerificationToken(result.user.id);
        const baseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
        const verifyUrl = `${baseUrl}/api/auth/verify-email/${encodeURIComponent(token)}`;
        const { sendEmailVerification } = await import("../lib/email-service");
        const emailRes = await sendEmailVerification({
          to: email,
          verifyUrl,
          fullName: result.user.full_name,
        });
        if (!emailRes.ok) {
          log.warn("Verification email not delivered (transport down) — user can resend", {
            userId: result.user.id,
            reason: emailRes.error,
          });
        }
      } catch (verifyErr: any) {
        log.error("verification email step failed (signup still succeeded)", {
          userId: result.user.id,
          error: verifyErr?.message ?? String(verifyErr),
        });
      }

      res.json(result);
    } catch (error: any) {
      if (error instanceof AuthConfigurationError) {
        log.error("Auth: Sign up unavailable — JWT secret missing", { error });
        return res.status(503).json({
          error: "Sign-up is temporarily unavailable. Platform configuration is incomplete.",
          code: "AUTH_NOT_CONFIGURED",
        });
      }

      const pgCode = getPostgresErrorCode(error);
      if (pgCode === "23505") {
        return res.status(409).json({
          error: "An account with this email already exists. Try signing in instead.",
          code: "EMAIL_TAKEN",
        });
      }
      log.error("Auth: Sign up endpoint failed", {
        error: error?.message ?? String(error),
        pgCode: pgCode ?? null,
        cause: error?.cause?.message ?? null,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/auth/signup-intent
 *
 * Persists marketing intent captured from public CTAs after the visitor
 * authenticates. This keeps pricing/wedge attribution attached to OAuth
 * signups too, not only the email/password form path.
 */
router.post(
  "/api/auth/signup-intent",
  authenticateUser,
  validateBody(signupIntentSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { saveSignupAttribution } = await import("../lib/trial-gate");
      await saveSignupAttribution(req.user.id, req.body);
      return res.json({ ok: true });
    } catch (err: any) {
      log.error("signup intent save failed", {
        userId: req.user?.id,
        error: err?.message ?? String(err),
      });
      return res.status(500).json({ error: "Failed to save signup intent" });
    }
  },
);

/**
 * GET /api/auth/verify-email/:token
 *
 * Magic-link landing for the email-verification flow. The link in
 * the email points here; we look up the token by sha256 hash,
 * validate TTL + unused state, flip users.emailVerifiedAt, then
 * redirect the browser to "/?verified=1" so the SPA can show a
 * brief success toast.
 */
router.get("/api/auth/verify-email/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  try {
    const user = await authService.completeEmailVerification(token);
    const baseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
    if (!user) {
      // Generic message — never leak which case (expired / used /
      // bad hash) so an attacker can't enumerate tokens.
      return res.redirect(`${baseUrl}/?verified=expired`);
    }
    log.info("Email verified", { userId: user.id });
    return res.redirect(`${baseUrl}/?verified=1`);
  } catch (err: any) {
    log.error("verify-email endpoint failed", { error: err?.message ?? String(err) });
    const baseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
    return res.redirect(`${baseUrl}/?verified=error`);
  }
});

/**
 * POST /api/auth/resend-verification
 *
 * Authenticated. Re-issues the verification link to the current
 * user's email. Idempotent — old tokens stay valid until they
 * expire, the new one is just an additional valid token. Returns
 * { ok: true, sent: boolean }. `sent: false` means the transport
 * is down (RESEND_API_KEY missing) — frontend should surface a
 * fail-loud message, not a "check your inbox" toast.
 */
router.post(
  "/api/auth/resend-verification",
  authenticateUser,
  resendVerificationRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Read current user (might already be verified — bail clean).
      const [user] = await drizzle
        .select({
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.users.fullName,
          emailVerifiedAt: schema.users.emailVerifiedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, req.user.id))
        .limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.emailVerifiedAt) {
        return res.json({ ok: true, sent: false, reason: "already_verified" });
      }

      const { token } = await authService.createEmailVerificationToken(user.id);
      const baseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
      const verifyUrl = `${baseUrl}/api/auth/verify-email/${encodeURIComponent(token)}`;
      const { sendEmailVerification } = await import("../lib/email-service");
      const result = await sendEmailVerification({
        to: user.email,
        verifyUrl,
        fullName: user.fullName,
      });
      return res.json({
        ok: true,
        sent: result.ok,
        ...(result.ok ? {} : { reason: "transport_unavailable" }),
      });
    } catch (err: any) {
      log.error("resend-verification failed", { error: err?.message ?? String(err) });
      return res.status(500).json({ error: "Resend failed" });
    }
  },
);

/**
 * POST /api/auth/signout
 */
router.post("/api/auth/signout", async (_req: Request, res: Response) => {
  res.json({ success: true });
});

/**
 * Resolve the absolute URL base for password reset links. Mirrors the
 * pattern in billing-routes — prefer the configured APP_URL, fall back
 * to the request's origin header, then localhost for dev. The result is
 * trailing-slash-trimmed so callers can append a clean `/reset-password`.
 */
function appBaseUrl(req: Request): string {
  return (process.env.APP_URL || req.get("origin") || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Equalize response time across the registered/unregistered paths in
 * /forgot-password. createPasswordResetToken does real work (DB lookup
 * + scrypt-free insert + tokens) for registered emails and returns null
 * fast for unregistered ones. Without an equalizer, an attacker can
 * enumerate accounts by timing the response.
 *
 * Floor was empirically tuned from the PR #141 preview smoke test:
 * registered-path median ~700ms with outliers to 1025ms; unregistered
 * ~620ms with the prior 300ms floor. The 100-150ms median gap (plus
 * variance) was a usable timing oracle for an attacker willing to
 * sample. Floor at 1000ms forces both paths to converge at ≈1s — the
 * registered path's outliers are at the floor, unregistered is held
 * there too. ≤1s is acceptable UX for a once-per-recovery action.
 */
const FORGOT_PASSWORD_MIN_DURATION_MS = 1000;
async function equalizedDuration<T>(promise: Promise<T>): Promise<T> {
  // Promise.all enforces a minimum wall-clock by racing the work
  // against a fixed-delay timer. Long DB latency on the registered
  // path naturally exceeds the floor; short returns on the
  // unregistered path get padded out so timing can't distinguish.
  const [value] = await Promise.all([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, FORGOT_PASSWORD_MIN_DURATION_MS)),
  ]);
  return value;
}

/**
 * POST /api/auth/forgot-password
 *
 * Issue a single-use reset token (1h TTL) and email the user a reset
 * link. Always returns 200 with a generic "if-registered" message — we
 * never confirm or deny account existence (defeats enumeration). The
 * registered/unregistered branches are wall-clock-equalized via
 * equalizedDuration() so the response time alone can't be used as an
 * oracle either.
 *
 * Email delivery goes through src/lib/email-service.ts. If
 * RESEND_API_KEY is configured the link goes via Resend; otherwise the
 * helper falls back to a log.warn so single-tenant pre-launch ops can
 * recover the URL from runtime logs.
 */
router.post(
  "/api/auth/forgot-password",
  forgotPasswordRateLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      // Email is now validated by Zod middleware

      const issued = await equalizedDuration(authService.createPasswordResetToken(email, req.ip));

      if (issued) {
        const resetUrl = `${appBaseUrl(req)}/reset-password?token=${encodeURIComponent(issued.token)}`;
        // SECURITY: NEVER log the plaintext token — that's account
        // takeover for anyone with log access. The email helper logs
        // only the resetUrl when transport is the dev-fallback path,
        // and that path warns loudly that it's not safe for prod.
        const sendResult = await sendPasswordResetEmail({
          to: email,
          resetUrl,
          expiresAt: issued.expiresAt,
        });
        log.info("Password reset token issued", {
          email,
          expiresAt: issued.expiresAt.toISOString(),
          tokenPrefix: issued.token.slice(0, 6) + "…",
          transport: sendResult.provider,
          delivery_ok: sendResult.ok,
        });
        if (!sendResult.ok) {
          log.warn("Password reset email send failed", {
            email,
            transport: sendResult.provider,
            error: sendResult.error,
          });
        }
      }

      return res.json({
        ok: true,
        message:
          "If that email is registered, a reset link is on its way. Check your inbox in a minute.",
      });
    } catch (error) {
      log.error("Auth: forgot-password issue failed", { error });
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/auth/reset-password
 *
 * Consume the token + set the new password. Returns the freshly
 * authenticated user + JWT on success so the UI can sign them in
 * immediately. Token row + user row update happen in the same
 * transaction inside authService.completePasswordReset so a partial
 * failure can't leave a "used but password not rotated" state.
 *
 * Body: { token, new_password } — `new_password` is snake-case to match
 * the contract documented in the Phase 2 prompt; the handler also
 * accepts the legacy `password` key so AuthPortal forms that send
 * either work.
 */
router.post(
  "/api/auth/reset-password",
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      // Body is now validated by Zod middleware

      const result = await authService.completePasswordReset(token, password);
      if (!result) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }
      return res.json(result);
    } catch (error) {
      log.error("Auth: reset-password complete failed", { error });
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
