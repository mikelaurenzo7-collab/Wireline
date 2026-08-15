import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, planById } from "../lib/plan-catalog";
import { drizzle, auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  stripe,
  stripeAvailable,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
} from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";
import { emitServerProductEvent } from "../lib/product-event-server";
import { resolveStrictFounderPriceId } from "../lib/stripe-founder-price";
import { resolveOwnedStripeCustomer } from "../lib/stripe-customer-binding";
import { findPotentiallyLiveStripeSubscription } from "../lib/stripe-subscription-safety";

const router = Router();

const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  // Kept in parity with the atomic route and stripe-helpers'
  // CURRENT_PLAN_SUBSCRIPTION_STATUSES: a paused subscription is still current
  // to webhook reconciliation, so treating it as not-live here would let a
  // second subscription be created that makes every later webhook throw. This
  // route is shadowed by the atomic router today, but the sets must not drift.
  "paused",
]);

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
          "This self-serve plan is no longer offered. Choose Pro for up to five live agents, or contact sales for a Scale rollout.",
        replacement: "business",
        contact_sales: "/contact?topic=enterprise",
      });
    }
    if (plan.id === "personal" || plan.price_usd_monthly === 0) {
      return res.status(400).json({
        code: "FREE_PLAN_NO_CHECKOUT",
        error: "Free Builder does not require checkout.",
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

    // Source-of-truth guard: local row can lag the webhook. If Stripe already
    // has a live subscription for this customer, refuse another Checkout.
    let reusableExistingCustomerId: string | null = null;
    if (existing?.stripeCustomerId) {
      const reusable = await resolveOwnedStripeCustomer({
        customerId: existing.stripeCustomerId,
        userId: req.user.id,
        authenticatedEmail: req.user.email,
      });
      reusableExistingCustomerId = reusable?.id || null;
    }

    if (reusableExistingCustomerId) {
      const liveRemote = await findPotentiallyLiveStripeSubscription(reusableExistingCustomerId);
      if (liveRemote) {
        return res.status(409).json({
          code: "ALREADY_SUBSCRIBED",
          error: "You already have a subscription. Use the Customer Portal to change plans.",
          current_plan: existing.plan,
          current_status: liveRemote.status,
        });
      }
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

    let customerId = reusableExistingCustomerId;
    if (customerId) {
      const attributed = await resolveOwnedStripeCustomer({
        customerId,
        userId: req.user.id,
        authenticatedEmail: req.user.email,
        metadata: attributionMetadata,
      });
      customerId = attributed?.id || null;
    }
    if (!customerId) {
      // Serialize first-time Stripe customer creation per tenant so parallel
      // checkout clicks cannot orphan duplicate Stripe customers.
      customerId = await drizzle.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);
        const [locked] = await tx
          .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.userId, req.user.id))
          .limit(1);
        if (locked?.stripeCustomerId) {
          const reusable = await resolveOwnedStripeCustomer({
            customerId: locked.stripeCustomerId,
            userId: req.user.id,
            authenticatedEmail: req.user.email,
            metadata: attributionMetadata,
          });
          if (reusable) return reusable.id;
        }

        const customer = await stripe.customers.create(
          {
            email: req.user.email,
            metadata: { wireline_user_id: req.user.id, ...attributionMetadata },
          },
          {
            idempotencyKey: locked?.stripeCustomerId
              ? `wireline-customer-recovery-${req.user.id}-${locked.stripeCustomerId}`
              : `wireline-customer-${req.user.id}`,
          },
        );
        await tx
          .insert(schema.subscriptions)
          .values({
            userId: req.user.id,
            stripeCustomerId: customer.id,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.subscriptions.userId,
            set: { stripeCustomerId: customer.id, updatedAt: new Date() },
          });
        return customer.id;
      });
    }

    const priceId = await resolveStrictFounderPriceId(plan.id, interval);
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
      integration_identifier: stripeCheckoutIntegrationIdentifier("plan"),
      customer: customerId,
      customer_update: { address: "auto" },
      ...stripeCheckoutTaxConfig(),
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
