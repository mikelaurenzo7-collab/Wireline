import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authService } from "../lib/auth-service";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

// Sign-in: accept any non-empty password so legacy users registered before
// the min-length rule can still authenticate.
const signinSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

// Sign-up: enforce 8-char minimum to set a baseline going forward.
const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  fullName: z.string().max(120).optional(),
});

// `req.ip` is the real client IP because server.ts sets `app.set('trust proxy', 1)`
// — Express trusts exactly one hop (the Vercel edge), so client-supplied
// X-Forwarded-For prefixes are ignored.
async function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const emailKey = String(req.body?.email || "").toLowerCase().slice(0, 254);
  const key = `${req.ip || "anon"}:${emailKey}`;
  try {
    const r = await rateLimit(key, { bucket: "auth", windowMs: 60_000, max: 5 });
    if (!r.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(r.resetMs / 1000)));
      return res.status(429).json({ error: "Too many attempts. Try again shortly." });
    }
  } catch (err) {
    log.warn("Auth rate-limit check failed open", { error: getErrorMessage(err) });
  }
  next();
}

/**
 * POST /api/auth/signin
 * Authenticate a user and return a JWT.
 */
router.post("/api/auth/signin", authRateLimit, async (req: Request, res: Response) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    log.warn("Auth: signin validation failed", { ip: req.ip });
    return res.status(400).json({ error: "Invalid email or password format" });
  }
  const { email, password } = parsed.data;

  try {
    const result = await authService.signIn(email, password);
    if (!result) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json(result);
  } catch (error) {
    log.error("Auth: Sign in endpoint failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/signup
 * Register a new user and return a JWT.
 */
router.post("/api/auth/signup", authRateLimit, async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    log.warn("Auth: signup validation failed", { ip: req.ip });
    return res.status(400).json({ error: "Email must be valid and password at least 8 characters" });
  }
  const { email, password, fullName } = parsed.data;

  try {
    const result = await authService.signUp(email, password, fullName);
    res.json(result);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "23505") { // Unique violation in Postgres
      return res.status(400).json({ error: "An account with this email already exists" });
    }
    log.error("Auth: Sign up endpoint failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/signout
 * (Stateless JWTs don't strictly need a signout endpoint, but it's good for logging)
 */
router.post("/api/auth/signout", async (_req: Request, res: Response) => {
  // Client should delete the token. Server-side revocation is post-launch debt.
  res.json({ success: true });
});

export default router;
