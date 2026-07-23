import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, planById, planLookupKey } from "../lib/plan-catalog";
import { drizzle, auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";
import { emitServerProductEvent } from "../lib/product-event-server";

const router = Router();

const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
]);

async function resolveLaunchPriceId(
  planId: string,
  interval: "month" | "year",
): Promise<string | null> {
  const plan = planById(planId);
  if (!plan) return null;

  const envKey = interval === "year" ? plan.annualPriceIdEnv : plan.priceIdEnv;
  const envPriceId = process.env[envKey]?.trim();
  if (envPriceId) {
    try {
      const price = await stripe.prices.retrieve(envPriceId);
      if (
        price.active &&
        price.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION &&
        price.metadata?.wireline_plan_id === plan.id
      ) {
        return price.id;
      }
    } catch (error) {
      log.warn("Configured Stripe price could not be validated; using lookup key", {
        planId: plan.id,
        interval,
        envKey,
        error: getErrorMessage(error),
      });
    }
  }

  const lookupKey = planLookupKey(plan, interval);
  if (!lookupKey) return null;
  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [lookupKey],
    limit: 1,
  });
  const price = prices.data[0];
  if (
    !price ||
    price.metadata?.wireline_plan_id !== plan.id ||
    price.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION
  ) {
    return null;
  }
  return price.id;
}

/**
 * Canonical founder-catalog checkout — sole owner of POST /api/billing/checkout.
 *
 * Resolves immutable Stripe lookup keys (env price ids are validated hints only)
 * and never attaches postpaid metered overage. Retired/non-public plans return
 * LEGACY_PLAN_RETIRED so stale clients cannot reacquire them.
 */
router.post(
  "/api/billing/checkout",
  authenticateUser,
  enforceLaunchHardGate,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!stripeAvailable()) throw AppError.fromHttpStatus(503, "Stripe not configured.");

    const requestedPlanId = String(req.body?.plan_id || "").trim();
    const interval = req.body?.interval === "year" ? "year" : "month";
    const plan = planById(requestedPlanId);

    if (!plan) throw AppError.fromHttpStatus(400, "Unknown plan_id.");
    if (plan.public === false) {
      return res.status(410).json({
        code: "LEGACY_PLAN_RETIRED",
        error:
          "This personal subscription is no longer offered. Start free. Fund live work with Conversation Balance when you are ready.",
        replacement: "conversation_balance",
      });
    }
    if (plan.id === "personal" || plan.price_usd_monthly === 0) {
      return res.status(400).json({
        code: "CONTACT_SALES_PLAN",
        error:
          plan.id === "enterprise"
            ? "Enterprise is founder-led. Contact sales@trywireline.com."
            : "Free Builder does not require checkout.",
      });
    }

    const [existing] = await drizzle
      .select({
        stripeCustomerId: schema.subscriptions.stripeCustomerId,
        stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
        status: schema.subscriptions.status,
        plan: schema.subscriptions.plan,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, req.user.id))
      .limit(1);

    if (existing?.stripeSubscriptionId && LIVE_SUBSCRIPTION_STATUSES.has(existing.status || "")) {
      return res.status(409).json({
        code: "ALREADY_SUBSCRIBED",
        error: "You already have a subscription. Use the Customer Portal to change plans.",
        current_plan: existing.plan,
        current_status: existing.status,
      });
    }

    const [signupIntent] = await drizzle
      .select({
        signupPlanInterest: schema.settings.signupPlanInterest,
        signupWedge: schema.settings.signupWedge,
        acquisitionSource: schema.settings.acquisitionSource,
        acquisitionMedium: schema.settings.acquisitionMedium,
        acquisitionCampaign: schema.settings.acquisitionCampaign,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, req.user.id))
      .limit(1);

    const attributionMetadata = Object.fromEntries(
      Object.entries({
        wireline_signup_plan_interest: signupIntent?.signupPlanInterest,
        wireline_signup_wedge: signupIntent?.signupWedge,
        wireline_acquisition_source: signupIntent?.acquisitionSource,
        wireline_acquisition_medium: signupIntent?.acquisitionMedium,
        wireline_acquisition_campaign: signupIntent?.acquisitionCampaign,
      }).filter(([, value]) => !!value),
    ) as Record<string, string>;

    let customerId = existing?.stripeCustomerId || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { wireline_user_id: req.user.id, ...attributionMetadata },
      });
      customerId = customer.id;
      await drizzle
        .insert(schema.subscriptions)
        .values({
          userId: req.user.id,
          stripeCustomerId: customerId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.subscriptions.userId,
          set: { stripeCustomerId: customerId, updatedAt: new Date() },
        });
    } else if (Object.keys(attributionMetadata).length > 0) {
      await stripe.customers.update(customerId, {
        metadata: { wireline_user_id: req.user.id, ...attributionMetadata },
      });
    }

    const priceId = await resolveLaunchPriceId(plan.id, interval);
    if (!priceId) {
      return res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        error: `Founder price for '${plan.id}' (${interval}) is not available.`,
      });
    }

    const appUrl = resolveCanonicalAppUrl();
    if ("error" in appUrl) {
      return res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        error: "Billing is unavailable: APP_URL is not configured.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_update: { address: "auto" },
      automatic_tax: { enabled: true },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl.url}/settings/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl.url}/settings/billing?billing=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          wireline_user_id: req.user.id,
          wireline_plan: plan.id,
          wireline_catalog_version: FOUNDER_CATALOG_VERSION,
          overage_policy: "prepaid_balance_only",
          ...attributionMetadata,
        },
      },
    });

    emitServerProductEvent({
      event: "subscription_checkout_started",
      userId: req.user.id,
      planId: plan.id,
      metadata: {
        interval,
        catalog_version: FOUNDER_CATALOG_VERSION,
        checkout_session_id: session.id,
      },
    });

    void auditLogger
      .logBilling("checkout_started", {
        userId: req.user.id,
        plan: plan.id,
        customerId,
        ip: req.ip,
        metadata: { interval, price_id: priceId, catalog: FOUNDER_CATALOG_VERSION },
      })
      .catch((error) =>
        log.warn("billing audit log failed", {
          event: "checkout_started",
          error: getErrorMessage(error),
        }),
      );

    return res.json({ url: session.url });
  },
);

export default router;
