import { Router, Request, Response } from "express";
import { authService } from "../lib/auth-service";
import { log } from "../lib/server-context";
import { signinRateLimiter, forgotPasswordRateLimiter } from "../middleware/rate-limit-middleware";
import { sendPasswordResetEmail } from "../lib/email-service";

const router = Router();

/**
 * POST /api/auth/signin
 * Authenticate a user and return a JWT. Rate-limited 5 attempts / 15 min
 * per (email, IP) pair to slow credential stuffing.
 */
router.post("/api/auth/signin", signinRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await authService.signIn(email, password);
    if (!result) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json(result);
  } catch (error) {
    // New refined logger captures the full error object
    log.error("Auth: Sign in endpoint failed", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/signup
 * Register a new user and return a JWT.
 */
router.post("/api/auth/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await authService.signUp(email, password, fullName);
    res.json(result);
  } catch (error: any) {
    if (error.code === "23505") {
      // Unique violation in Postgres
      return res.status(400).json({ error: "An account with this email already exists" });
    }
    log.error("Auth: Sign up endpoint failed", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

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
  async (req: Request, res: Response) => {
    try {
      const email = (req.body?.email || "").toString().trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

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
router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const token = body.token;
    const newPassword = body.new_password ?? body.password;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password required" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      // Matches the /signup minimum — we explicitly do NOT add a stronger
      // complexity rule here so reset never rejects a password that
      // signup would have accepted.
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    const result = await authService.completePasswordReset(token, newPassword);
    if (!result) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }
    return res.json(result);
  } catch (error) {
    log.error("Auth: reset-password complete failed", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
