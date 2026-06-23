import express, { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { auditLogger, drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { getCreditBalanceUsd, getRecentLedger } from "../lib/credit-wallet";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_MAX_USD,
  CONVERSATION_BALANCE_MIN_USD,
  CONVERSATION_BALANCE_PRESETS_USD,
  isConversationBalanceAmount,
} from "../lib/conversation-balance";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";

const router = express.Router();

/**
 * Public account-holder view of the prepaid wallet. The wallet remains web-only
 * for purchase so native clients do not accidentally trigger in-app purchase
 * obligations; they may consume this read model later.
 */
router.get(
  "/api/conversation-balance",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [balanceUsd, ledger] = await Promise.all([
        getCreditBalanceUsd(req.user.id),
        getRecentLedger(req.user.id, 20),
      ]);

      res.json({
        balance_usd: Number(balanceUsd.toFixed(2)),
        presets_usd: [...CONVERSATION_BALANCE_PRESETS_USD],
        min_usd: CONVERSATION_BALANCE_MIN_USD,
        max_usd: CONVERSATION_BALANCE_MAX_USD,
        copy: CONVERSATION_BALANCE_COPY,
        ledger,
        stripe_configured: stripeAvailable(),
      });
    } catch (err) {
      log.error("conversation balance read failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Could not load Conversation Balance.");
    }
  },
);

/**
 * Create a one-time Stripe Checkout session for a Conversation Balance top-up.
 * Existing billing-routes webhook handling claims this payment by the purpose
 * metadata and writes an idempotent ledger credit after Stripe confirms paid.
 */
router.post(
  "/api/conversation-balance/checkout",
  authenticateUser,
  enforceLaunchHardGate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!stripeAvailable()) throw AppError.fromHttpStatus(503, "Stripe is not configured.");

      const amountUsd = Number(req.body?.amount_usd);
      if (!isConversationBalanceAmount(amountUsd)) {
        return res.status(400).json({
          code: "INVALID_AMOUNT",
          error: `Choose a whole-dollar amount between $${CONVERSATION_BALANCE_MIN_USD} and $${CONVERSATION_BALANCE_MAX_USD}.`,
        });
      }

      const [subscription] = await drizzle
        .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);

      let customerId = subscription?.stripeCustomerId || null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { wireline_user_id: req.user.id },
        });
        customerId = customer.id;
        await drizzle
          .insert(schema.subscriptions)
          .values({ userId: req.user.id, stripeCustomerId: customerId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.subscriptions.userId,
            set: { stripeCustomerId: customerId, updatedAt: new Date() },
          });
      }

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res.status(503).json({ error: "Billing is unavailable because APP_URL is not configured." });
      }

      const creditMeta = {
        wireline_user_id: req.user.id,
        purpose: "credit_topup",
        credit_usd: String(amountUsd),
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amountUsd * 100),
              product_data: {
                name: "Wireline Conversation Balance",
                description: `$${amountUsd} prepaid balance for Wireline live work`,
              },
            },
          },
        ],
        success_url: `${appUrl.url}/billing?balance=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl.url}/billing?balance=canceled`,
        payment_intent_data: { metadata: creditMeta },
        metadata: creditMeta,
      });

      res.json({ url: session.url });
      void auditLogger
        .logBilling("conversation_balance_checkout_started", {
          userId: req.user.id,
          customerId,
          amountCents: Math.round(amountUsd * 100),
          ip: req.ip,
          metadata: { product: "conversation_balance" },
        })
        .catch((err) =>
          log.warn("conversation balance checkout audit failed", { error: getErrorMessage(err) }),
        );
    } catch (err) {
      log.error("conversation balance checkout failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Could not start Conversation Balance checkout.");
    }
  },
);

export default router;
