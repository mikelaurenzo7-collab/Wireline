import { Router, Request, Response } from "express";
import { authService } from "../lib/auth-service";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

const router = Router();

/**
 * POST /api/auth/signin
 * Authenticate a user and return a JWT.
 */
router.post("/api/auth/signin", async (req: Request, res: Response) => {
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
    log.error("Auth: Sign in endpoint failed", { error: getErrorMessage(error) });
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
    if (error.code === "23505") { // Unique violation in Postgres
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
router.post("/api/auth/signout", async (req: Request, res: Response) => {
  // Client should delete the token.
  res.json({ success: true });
});

export default router;
