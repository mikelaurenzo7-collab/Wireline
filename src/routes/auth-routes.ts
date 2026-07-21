/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Request, Response } from "express";
import { AppError } from "../lib/api-error";
import {
  authService,
  AuthConfigurationError,
  generateToken,
  isOwnerEmail,
} from "../lib/auth-service";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import {
  signinRateLimiter,
  signupRateLimiter,
  forgotPasswordRateLimiter,
  resendVerificationRateLimiter,
  resetPasswordRateLimiter,
  migrateSessionRateLimiter,
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
import {
  bootstrapFounderAssistantIfEmpty,
  scheduleFounderBootstrap,
} from "../lib/founder-bootstrap";
import { authSuccessBody, clearSessionCookie, setSessionCookie } from "../lib/session-cookie";
import { verifyInternalJwt } from "../lib/auth-utils";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { ensureDefaultAccount } from "../lib/account-service";
import { PasswordRejectedError } from "../lib/breached-passwords";
import { emitServerProductEventOnce } from "../lib/product-event-server";
const router = Router();

function sendAuthSuccess(
  res: Response,
  user: {
    id: string;
    email: string;
    full_name?: string | null;
    is_owner?: boolean;
    account_type?: "personal" | "business";
  },
  token: string,
) {
  setSessionCookie(res, token);
  return res.json(authSuccessBody(user));
}

function sendPasswordRejected(res: Response, error: PasswordRejectedError) {
  return res.status(error.httpStatus).json({
    error: error.message,
    code: error.code,
  });
}

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

      // Equalized so "no such account" (fast) and "wrong password" (scrypt)
      // take indistinguishable wall-clock time — see SIGNIN_MIN_DURATION_MS.
      const result = await equalizedDuration(
        authService.signIn(email, password),
        SIGNIN_MIN_DURATION_MS,
      );
      if (!result) {
        throw AppError.fromHttpStatus(401, "Invalid email or password");
      }

      scheduleFounderBootstrap(result.user.id, result.user.email);

      return sendAuthSuccess(res, result.user, result.token);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof AuthConfigurationError) {
        log.error("Auth: Sign in unavailable — JWT secret missing", { error });
        return res.status(503).json({
          error: "Sign-in is temporarily unavailable. Platform configuration is incomplete.",
          code: "AUTH_NOT_CONFIGURED",
        });
      }
      log.error("Auth: Sign in endpoint failed", { error });
      throw AppError.fromHttpStatus(500, "Internal server error");
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
        demoSource,
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

      emitServerProductEventOnce({
        event: "signup_completed",
        userId: result.user.id,
        metadata: {
          plan_id: preferredPlanId ?? null,
          wedge: signupWedge ?? null,
          source: "email_password",
        },
      });

      scheduleFounderBootstrap(result.user.id, result.user.email);

      if (demoSource) {
        const { attributeDemoSignup } = await import("../lib/demo-funnel");
        await attributeDemoSignup(result.user.id, demoSource);
      }

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

      return sendAuthSuccess(res, result.user, result.token);
    } catch (error: any) {
      if (error instanceof PasswordRejectedError) {
        return sendPasswordRejected(res, error);
      }
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
      throw AppError.fromHttpStatus(500, "Internal server error");
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
    const { saveSignupAttribution } = await import("../lib/trial-gate");
    await saveSignupAttribution(req.user.id, req.body);
    // Attribution is best-effort — saveSignupAttribution logs and swallows DB errors.
    return res.json({ ok: true });
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
      if (!user) throw AppError.fromHttpStatus(404, "User not found");
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
      throw AppError.fromHttpStatus(500, "Resend failed");
    }
  },
);

/**
 * POST /api/auth/signout
 */
/**
 * POST /api/auth/refresh
 *
 * Authenticated. Re-issues a fresh JWT for an already-valid session so
 * the client can rotate an expiring bearer without re-entering credentials.
 */
router.post(
  "/api/auth/refresh",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const token = generateToken({ id: req.user.id, email: req.user.email });
    setSessionCookie(res, token);
    const authHeader = req.get("authorization") || "";
    const bearerRequested = authHeader.toLowerCase().startsWith("bearer ");
    return res.json(bearerRequested ? { ok: true, token } : { ok: true });
  },
);

/**
 * GET /api/auth/session — hydrate client user from httpOnly cookie.
 */
router.get(
  "/api/auth/session",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const [[row], [sub]] = await Promise.all([
      drizzle
        .select({ fullName: schema.users.fullName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, req.user.id))
        .limit(1),
      drizzle
        .select({ plan: schema.subscriptions.plan })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1),
    ]);
    const { resolveAccountType } = await import("../lib/account-type");
    const fallbackAccountType = resolveAccountType(sub?.plan);
    const account_type = (await ensureDefaultAccount(req.user.id, fallbackAccountType)).type;

    return res.json({
      user: {
        id: req.user.id,
        email: row?.email ?? req.user.email,
        full_name: row?.fullName ?? undefined,
        is_owner: isOwnerEmail(req.user.email),
        account_type,
      },
    });
  },
);

/**
 * POST /api/auth/migrate-session — one-time move from legacy localStorage JWT.
 */
router.post(
  "/api/auth/migrate-session",
  migrateSessionRateLimiter,
  async (req: Request, res: Response) => {
    const authHeader =
      typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: "Missing token. Send Authorization: Bearer <legacy-jwt>.",
      });
    }
    try {
      const secret = requireInternalJwtSecret();
      const payload = await verifyInternalJwt(token, secret);
      if (!payload?.sub || !payload.email) {
        throw AppError.fromHttpStatus(401, "Invalid or expired session");
      }
      const rotated = generateToken({ id: payload.sub, email: payload.email });
      setSessionCookie(res, rotated);
      return res.json({
        user: {
          id: payload.sub,
          email: payload.email,
          is_owner: isOwnerEmail(payload.email),
        },
      });
    } catch {
      throw AppError.fromHttpStatus(401, "Invalid or expired session");
    }
  },
);

/**
 * POST /api/auth/signout
 */
router.post("/api/auth/signout", async (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

/**
 * Equalize response time across two paths that would otherwise diverge in
 * a way an attacker can time to enumerate accounts or distinguish "no
 * such user" from "wrong password." Promise.all enforces a minimum
 * wall-clock by racing the real work against a fixed-delay timer: work
 * that's naturally slower than the floor is unaffected; work that
 * finishes faster gets padded out so timing can't distinguish it from
 * the slower path.
 */
async function equalizedDuration<T>(promise: Promise<T>, minMs: number): Promise<T> {
  const [value] = await Promise.all([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, minMs)),
  ]);
  return value;
}

/**
 * /forgot-password floor. createPasswordResetToken does real work (DB
 * lookup + scrypt-free insert + tokens) for registered emails and
 * returns null fast for unregistered ones.
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

/**
 * /signin floor. authService.signIn returns null fast for an
 * unregistered email (one indexed SELECT, no scrypt) but only after
 * running scryptSync for a registered email with the wrong password —
 * the same enumeration-by-timing bug class as forgot-password. Unlike
 * forgot-password, signin is a high-frequency action, so the floor is
 * tuned much lower: scrypt (N=16384) plus a pooled DB lookup typically
 * completes in well under 400ms, so a correct-password signin is not
 * perceptibly slowed, while the fast "no such user" path is padded up
 * to match the slower "wrong password" path closely enough that timing
 * sampling stops being a practical enumeration oracle. Combined with
 * signinRateLimiter (5 attempts / 15 min per email+IP), this closes the
 * gap without adding a full second to every login.
 */
const SIGNIN_MIN_DURATION_MS = 400;

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

      const issued = await equalizedDuration(
        authService.createPasswordResetToken(email, req.ip),
        FORGOT_PASSWORD_MIN_DURATION_MS,
      );

      if (issued) {
        const appUrl = resolveCanonicalAppUrl();
        if ("error" in appUrl) {
          log.error("Password reset skipped: APP_URL not configured in production");
        } else {
          const resetUrl = `${appUrl.url}/reset-password?token=${encodeURIComponent(issued.token)}`;
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
      }

      return res.json({
        ok: true,
        message:
          "If that email is registered, a reset link is on its way. Check your inbox in a minute.",
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Auth: forgot-password issue failed", { error });
      throw AppError.fromHttpStatus(500, "Internal server error");
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
  resetPasswordRateLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      // Body is now validated by Zod middleware

      const result = await authService.completePasswordReset(token, password);
      if (!result) {
        throw AppError.fromHttpStatus(400, "Invalid or expired reset link");
      }
      return sendAuthSuccess(res, result.user, result.token);
    } catch (error) {
      if (error instanceof PasswordRejectedError) {
        return sendPasswordRejected(res, error);
      }
      if (error instanceof AppError) throw error;
      log.error("Auth: reset-password complete failed", { error });
      throw AppError.fromHttpStatus(500, "Internal server error");
    }
  },
);

/**
 * GET /api/auth/bootstrap
 * One-shot session bootstrap — seeds the founder Assistants when the owner account
 * has zero agents. Safe to call on every app load; no-ops when already seeded.
 */
router.get(
  "/api/auth/bootstrap",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await bootstrapFounderAssistantIfEmpty(req.user.id, req.user.email);
      res.json({
        ok: true,
        founderSeeded: result.seeded,
        subscriptionEnsured: result.subscriptionEnsured ?? false,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.warn("Auth: bootstrap failed", { userId: req.user.id, error });
      res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        ok: false,
        founderSeeded: false,
        error: "Bootstrap failed",
      });
    }
  },
);

export default router;
