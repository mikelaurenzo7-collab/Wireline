import express, { Response } from "express";
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
import { planById } from "../lib/plan-catalog";

const router = express.Router();

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
 * One-time prepaid top-up. A live paid plan is required because Conversation
 * Balance is controlled overflow, not a back door around Starter activation.
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
        .select({
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);

      const plan = planById(subscription?.plan);
      // Every paid plan can top up. `personal` is the free Builder tier; the
      // `enterprise` id is the self-serve $159 Business plan, which must be
      // allowed (it exhausts its included minutes like any paid plan).
      const activePaidPlan =
        !!plan &&
        plan.id !== "personal" &&
        ["active", "trialing"].includes(subscription?.status || "");
      if (!activePaidPlan) {
        return res.status(402).json({
          code: "LIVE_PLAN_REQUIRED",
          error:
            "Choose Starter, Starter Plus, Pro, or Business before adding Conversation Balance. Paid plans include live-call minutes first.",
          recovery_path: "/settings/billing",
        });
      }

      let customerId = subscription?.stripeCustomerId || null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { wireline_user_id: req.user.id },
        });
        customerId = customer.id;
        await drizzle
          .update(schema.subscriptions)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(schema.subscriptions.userId, req.user.id));
      }

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res.status(503).json({
          code: "APP_URL_NOT_CONFIGURED",
          error: "Billing is unavailable because APP_URL is not configured.",
        });
      }

      const creditMeta = {
        wireline_user_id: req.user.id,
        wireline_plan: plan.id,
        purpose: "credit_topup",
        credit_usd: String(amountUsd),
        overage_policy: "prepaid_balance_only",
      };

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        customer_update: { address: "auto" },
        automatic_tax: { enabled: true },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amountUsd * 100),
              product_data: {
                name: "Wireline Conversation Balance",
                description: `$${amountUsd} prepaid balance for extra calls, texts, and live work`,
              },
            },
          },
        ],
        success_url: `${appUrl.url}/settings/billing?balance=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl.url}/settings/billing?balance=canceled`,
        payment_intent_data: { metadata: creditMeta },
        metadata: creditMeta,
      });

      res.json({ url: session.url });
      void auditLogger
        .logBilling("checkout_started", {
          userId: req.user.id,
          customerId,
          amountCents: Math.round(amountUsd * 100),
          ip: req.ip,
          metadata: { product: "conversation_balance", plan: plan.id },
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
