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
import { computeScheduledPurgeAt } from "../lib/account-deletion";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { stripe, stripeAvailable, syncSubscriptionFromStripe } from "../lib/stripe-helpers";
import { getErrorMessage } from "../lib/server-utils";

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

type RenewalStopResult = {
  renewalStopped: boolean;
  billingPeriodEnd: Date | null;
};

async function stopRenewalForDeletion(userId: string): Promise<RenewalStopResult> {
  const [subscription] = await drizzle
    .select({
      stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
      status: schema.subscriptions.status,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  const subscriptionId = subscription?.stripeSubscriptionId?.trim();
  const terminalStatuses = new Set(["canceled", "incomplete_expired"]);
  if (
    !subscriptionId ||
    subscription?.cancelAtPeriodEnd ||
    terminalStatuses.has(subscription?.status || "")
  ) {
    return {
      renewalStopped: true,
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }

  if (!stripeAvailable()) {
    log.error("account deletion could not stop renewal because Stripe is unavailable", {
      userId,
      subscriptionId,
    });
    return {
      renewalStopped: false,
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    try {
      await syncSubscriptionFromStripe(updated);
    } catch (syncError) {
      log.warn("account deletion stopped renewal but local Stripe sync needs recovery", {
        userId,
        subscriptionId,
        error: getErrorMessage(syncError),
      });
    }
    return {
      renewalStopped: updated.cancel_at_period_end || updated.status === "canceled",
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  } catch (error) {
    const stripeError = error as {
      code?: string;
      statusCode?: number;
      raw?: { code?: string };
    };
    if (
      stripeError.statusCode === 404 ||
      stripeError.code === "resource_missing" ||
      stripeError.raw?.code === "resource_missing"
    ) {
      log.warn("account deletion found no live Stripe subscription to renew", {
        userId,
        subscriptionId,
      });
      return {
        renewalStopped: true,
        billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
      };
    }

    log.error("account deletion could not confirm renewal was stopped", {
      userId,
      subscriptionId,
      error: getErrorMessage(error),
    });
    return {
      renewalStopped: false,
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }
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
        renewal_stopped: renewal.renewalStopped,
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
      renewalStopped: renewal.renewalStopped,
    });
    res.status(202).json({
      ok: true,
      scheduled_purge_at: row?.scheduledPurgeAt ?? scheduledPurgeAt,
      renewal_stopped: renewal.renewalStopped,
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
