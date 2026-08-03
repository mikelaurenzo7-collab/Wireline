import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, planById, planLookupKey } from "../lib/plan-catalog";
import { drizzle, auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { checkoutOperations } from "../db/security-schema";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";
import { emitServerProductEvent } from "../lib/product-event-server";

const router = Router();
const CHECKOUT_TTL_MS = 24 * 60 * 60_000;
const ACTIVE_OPERATION_STATES = ["creating", "open"];
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
  const envPriceId = envKey ? process.env[envKey]?.trim() : undefined;
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
  const prices = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 1 });
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

async function markCheckoutOperation(
  id: string,
  values: {
    status: "open" | "completed" | "failed" | "expired";
    stripeCustomerId?: string | null;
    stripeCheckoutSessionId?: string | null;
    checkoutUrl?: string | null;
    failureCode?: string | null;
  },
) {
  await drizzle
    .update(checkoutOperations)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(checkoutOperations.id, id));
}

async function ensureStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId: string | null,
  attributionMetadata: Record<string, string>,
): Promise<string> {
  if (existingCustomerId) {
    if (Object.keys(attributionMetadata).length) {
      await stripe.customers.update(existingCustomerId, {
        metadata: { wireline_user_id: userId, ...attributionMetadata },
      });
    }
    return existingCustomerId;
  }

  const customer = await stripe.customers.create(
    {
      email,
      metadata: { wireline_user_id: userId, ...attributionMetadata },
    },
    { idempotencyKey: `wireline-customer-${userId}` },
  );

  await drizzle
    .insert(schema.subscriptions)
    .values({ userId, stripeCustomerId: customer.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.subscriptions.userId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });
  return customer.id;
}

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
          "This personal subscription is no longer offered. Start free on Builder, then choose Starter or higher for live work.",
        replacement: "starter",
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
    if (existing?.stripeCustomerId) {
      const remote = await stripe.subscriptions.list({
        customer: existing.stripeCustomerId,
        status: "all",
        limit: 20,
      });
      const liveRemote = remote.data.find((sub) => LIVE_SUBSCRIPTION_STATUSES.has(sub.status));
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
      }).filter(([, value]) => Boolean(value)),
    ) as Record<string, string>;

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

    await drizzle
      .update(checkoutOperations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(checkoutOperations.userId, req.user.id),
          inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES),
          sql`${checkoutOperations.expiresAt} < clock_timestamp()`,
        ),
      );

    const [operation] = await drizzle
      .insert(checkoutOperations)
      .values({
        userId: req.user.id,
        planId: plan.id,
        billingInterval: interval,
        status: "creating",
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: checkoutOperations.id });

    if (!operation) {
      const [active] = await drizzle
        .select({
          id: checkoutOperations.id,
          planId: checkoutOperations.planId,
          billingInterval: checkoutOperations.billingInterval,
          status: checkoutOperations.status,
          checkoutUrl: checkoutOperations.checkoutUrl,
        })
        .from(checkoutOperations)
        .where(
          and(
            eq(checkoutOperations.userId, req.user.id),
            inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES),
          ),
        )
        .limit(1);
      if (
        active?.status === "open" &&
        active.checkoutUrl &&
        active.planId === plan.id &&
        active.billingInterval === interval
      ) {
        return res.json({ url: active.checkoutUrl, reused: true, operation_id: active.id });
      }
      return res.status(409).json({
        code: "CHECKOUT_ALREADY_IN_PROGRESS",
        error:
          active?.status === "open"
            ? "A different checkout is already open. Complete or cancel it before choosing another plan."
            : "Checkout is already being prepared. Try again in a moment.",
        operation_id: active?.id,
      });
    }

    const operationId = operation.id;
    try {
      const customerId = await ensureStripeCustomer(
        req.user.id,
        req.user.email,
        existing?.stripeCustomerId || null,
        attributionMetadata,
      );
      await drizzle
        .update(checkoutOperations)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(checkoutOperations.id, operationId));

      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          customer_update: { address: "auto" },
          automatic_tax: { enabled: true },
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${appUrl.url}/settings/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl.url}/settings/billing?billing=canceled`,
          allow_promotion_codes: true,
          client_reference_id: req.user.id,
          metadata: {
            wireline_user_id: req.user.id,
            wireline_checkout_operation_id: operationId,
            wireline_plan: plan.id,
            wireline_catalog_version: FOUNDER_CATALOG_VERSION,
          },
          subscription_data: {
            metadata: {
              wireline_user_id: req.user.id,
              wireline_checkout_operation_id: operationId,
              wireline_plan: plan.id,
              wireline_catalog_version: FOUNDER_CATALOG_VERSION,
              overage_policy: "prepaid_balance_only",
              ...attributionMetadata,
            },
          },
        },
        { idempotencyKey: `wireline-checkout-${operationId}` },
      );
      if (!session.url) throw new Error("Stripe Checkout returned no hosted URL");

      await markCheckoutOperation(operationId, {
        status: "open",
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: session.id,
        checkoutUrl: session.url,
        failureCode: null,
      });

      emitServerProductEvent({
        event: "subscription_checkout_started",
        userId: req.user.id,
        planId: plan.id,
        metadata: {
          interval,
          catalog_version: FOUNDER_CATALOG_VERSION,
          checkout_session_id: session.id,
          checkout_operation_id: operationId,
        },
      });
      void auditLogger
        .logBilling("checkout_started", {
          userId: req.user.id,
          plan: plan.id,
          customerId,
          ip: req.ip,
          metadata: {
            interval,
            price_id: priceId,
            catalog: FOUNDER_CATALOG_VERSION,
            operation_id: operationId,
          },
        })
        .catch((error) =>
          log.warn("billing audit log failed", {
            event: "checkout_started",
            error: getErrorMessage(error),
          }),
        );

      return res.json({ url: session.url, operation_id: operationId });
    } catch (error) {
      await markCheckoutOperation(operationId, {
        status: "failed",
        failureCode: "stripe_checkout_failed",
      }).catch(() => {});
      log.error("Atomic Stripe checkout failed", {
        operationId,
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(502, "Checkout could not be prepared. Please try again.");
    }
  },
);

export default router;
