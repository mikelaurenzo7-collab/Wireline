import { Router, Request, Response } from "express";
import { authService } from "../lib/auth-service";
import { log } from "../lib/server-context";
import { signinRateLimiter } from "../middleware/rate-limit-middleware";

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
 * POST /api/auth/password-reset
 * Issue a single-use reset token (15 min TTL). Always returns 200 with a
 * generic "if-registered" message so attackers can't enumerate accounts.
 * When no email transport is wired the token is logged + audit-logged so
 * support can copy it to the user manually.
 */
router.post("/api/auth/password-reset", async (req: Request, res: Response) => {
  try {
    const email = (req.body?.email || "").toString().trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const issued = await authService.createPasswordResetToken(email, req.ip);
    if (issued) {
      // SECURITY: NEVER log the plaintext token — that's account takeover
      // for anyone with log access. Log only that an issue happened +
      // expiry + a short prefix for correlation. Real email transport
      // (SES/Postmark) is the only path the plaintext token should travel.
      // If you need to manually issue while email is unwired, retrieve
      // from the wireline_password_reset_tokens admin view via your DB
      // tool — never the application logs.
      log.info("Password reset token issued", {
        email,
        expiresAt: issued.expiresAt.toISOString(),
        tokenPrefix: issued.token.slice(0, 6) + "…",
      });
    }
    return res.json({
      ok: true,
      message:
        "If that email is registered, a reset link is on its way. Check your inbox in a minute.",
    });
  } catch (error) {
    log.error("Auth: password-reset issue failed", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/password-reset/complete
 * Consume the token + set the new password. Returns the freshly authenticated
 * user + JWT on success so the UI can sign them in immediately.
 */
router.post("/api/auth/password-reset/complete", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: "Token and new password required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    const result = await authService.completePasswordReset(token, password);
    if (!result) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }
    return res.json(result);
  } catch (error) {
    log.error("Auth: password-reset complete failed", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
