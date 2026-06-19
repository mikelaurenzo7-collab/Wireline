/**
 * Account management routes — list, create, and switch between
 * personal and business accounts.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { validateBody } from "../lib/api-validation";
import {
  getAccountsForUser,
  createAccount,
  getAccountById,
  getPrimaryAccount,
} from "../lib/account-service";
import { log } from "../lib/server-context";

const router = Router();

const createAccountSchema = z.object({
  type: z.enum(["personal", "business"]),
  label: z.string().max(120).optional(),
});

/**
 * GET /api/accounts
 * Returns all accounts for the authenticated user.
 */
router.get("/api/accounts", authenticateUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const accounts = await getAccountsForUser(userId);
  res.json({ accounts });
});

/**
 * GET /api/accounts/primary
 * Returns the user's primary account (first created).
 */
router.get("/api/accounts/primary", authenticateUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const primary = await getPrimaryAccount(userId);
  if (!primary) {
    return res.status(404).json({ error: "No accounts found" });
  }
  res.json({ account: primary });
});

/**
 * GET /api/accounts/:id
 * Returns a specific account (must belong to the authenticated user).
 */
router.get("/api/accounts/:id", authenticateUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const account = await getAccountById(req.params.id, userId);
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }
  res.json({ account });
});

/**
 * POST /api/accounts
 * Create a new account (personal or business). A user can have at most
 * one of each type. The first account created becomes the primary.
 */
router.post(
  "/api/accounts",
  authenticateUser,
  validateBody(createAccountSchema),
  async (req: Request, res: Response) => {
    const userId = (req as any).userId as string;
    const { type, label } = req.body;

    try {
      const account = await createAccount(userId, type, label);
      res.status(201).json({ account });
    } catch (err) {
      log.error("account creation failed", {
        userId,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Failed to create account" });
    }
  },
);

export default router;
