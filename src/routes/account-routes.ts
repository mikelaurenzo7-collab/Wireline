import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { validateBody } from "../lib/api-validation";
import {
  getAccountsForUser,
  createAccount,
  getAccountById,
  getPrimaryAccount,
} from "../lib/account-service";
import { ACCOUNT_DELETION_GRACE_DAYS, computeScheduledPurgeAt } from "../lib/account-deletion";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { stopRenewalForDeletion } from "../lib/account-deletion-billing";

type AuthedRequest = Request & { user?: { id: string } };

const router = Router();

const createAccountSchema = z.object({
  type: z.enum(["personal", "business"]),
  label: z.string().max(120).optional(),
});

const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
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

router.get(
  "/api/account/deletion-status",
  authenticateUser,
  async (req: Request, res: Response) => {
    const userId = authenticatedUserId(req);
    const [pending] = await drizzle
      .select({
        scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
      })
      .from(schema.deletionQueue)
      .where(
        and(eq(schema.deletionQueue.userId, userId), eq(schema.deletionQueue.status, "pending")),
      )
      .limit(1);

    res.json({
      pending: Boolean(pending),
      status: pending ? "pending" : "none",
      scheduled_purge_at: pending?.scheduledPurgeAt ?? null,
      grace_days: ACCOUNT_DELETION_GRACE_DAYS,
      cancel_endpoint: pending ? "/api/account/cancel-deletion" : null,
    });
  },
);

router.post(
  "/api/account/delete",
  authenticateUser,
  validateBody(deleteAccountSchema),
  async (req: Request, res: Response) => {
    const userId = authenticatedUserId(req);
    const requestedAt = new Date();
    const scheduledPurgeAt = computeScheduledPurgeAt(requestedAt);

    const [existing] = await drizzle
      .select({
        id: schema.deletionQueue.id,
        scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
      })
      .from(schema.deletionQueue)
      .where(
        and(eq(schema.deletionQueue.userId, userId), eq(schema.deletionQueue.status, "pending")),
      )
      .limit(1);

    if (existing) {
      const renewal = await stopRenewalForDeletion(userId);
      return res.json({
        ok: true,
        already_pending: true,
        scheduled_purge_at: existing.scheduledPurgeAt,
        renewal_stopped: renewal.confirmed,
        billing_period_end: renewal.billingPeriodEnd,
      });
    }

    const [row] = await drizzle
      .insert(schema.deletionQueue)
      .values({
        userId,
        requestedAt,
        scheduledPurgeAt,
        status: "pending",
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
      })
      .returning({
        id: schema.deletionQueue.id,
        scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
      });

    const renewal = await stopRenewalForDeletion(userId);
    log.warn("account deletion requested", {
      userId,
      deletionRequestId: row?.id,
      renewalStopped: renewal.confirmed,
    });
    res.status(202).json({
      ok: true,
      scheduled_purge_at: row?.scheduledPurgeAt ?? scheduledPurgeAt,
      renewal_stopped: renewal.confirmed,
      billing_period_end: renewal.billingPeriodEnd,
    });
  },
);

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
