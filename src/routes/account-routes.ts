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

type AuthedRequest = Request & { user?: { id: string } };

const router = Router();

const createAccountSchema = z.object({
  type: z.enum(["personal", "business"]),
  label: z.string().max(120).optional(),
});

function authenticatedUserId(req: Request): string {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) throw new Error("Authenticated account route invoked without a user.");
  return userId;
}

router.get("/api/accounts", authenticateUser, async (req: Request, res: Response) => {
  const accounts = await getAccountsForUser(authenticatedUserId(req));
  res.json({ accounts });
});

router.get("/api/accounts/primary", authenticateUser, async (req: Request, res: Response) => {
  const primary = await getPrimaryAccount(authenticatedUserId(req));
  if (!primary) return res.status(404).json({ code: "NOT_FOUND", error: "No accounts found" });
  res.json({ account: primary });
});

router.get("/api/accounts/:id", authenticateUser, async (req: Request, res: Response) => {
  const account = await getAccountById(req.params.id, authenticatedUserId(req));
  if (!account) return res.status(404).json({ code: "NOT_FOUND", error: "Account not found" });
  res.json({ account });
});

router.post(
  "/api/accounts",
  authenticateUser,
  validateBody(createAccountSchema),
  async (req: Request, res: Response) => {
    const userId = authenticatedUserId(req);
    const { type, label } = req.body;

    try {
      const account = await createAccount(userId, type, label);
      res.status(201).json({ account });
    } catch (error) {
      log.error("account creation failed", {
        userId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to create account" });
    }
  },
);

export default router;
