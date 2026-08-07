import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, planById, planLookupKey } from "../lib/plan-catalog";
import { drizzle, auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { isMissingStripeResource, stripe, stripeAvailable } from "../lib/stripe-helpers";
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
  // A paused subscription (trial ended without a payment method) is still a
  // current subscription to webhook reconciliation. Omitting it here let
  // checkout create a second subscription for the same customer, after which
  // currentPlanSubscriptionForCustomer threw on every webhook and the paying
  // customer never received entitlements.
  "paused",
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
    status: "creating" | "open" | "completed" | "failed" | "expired";
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

/**
 * Terminal-failure write fenced to operations still being created. A concurrent
 * request can resolve the same operation to `open` while this one is failing;
 * the failed write must never clobber that resolved state (and thereby free
 * the partial-unique slot for a second payable checkout).
 */
async function failCheckoutOperation(
  id: string,
  values: {
    stripeCustomerId?: string | null;
    failureCode?: string | null;
  },
) {
  await drizzle
    .update(checkoutOperations)
    .set({ status: "failed", ...values, updatedAt: new Date() })
    .where(and(eq(checkoutOperations.id, id), eq(checkoutOperations.status, "creating")));
}

async function reusableStripeCustomerId(
  customerId: string,
  userId: string,
): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return null;
    const boundUserId = customer.metadata?.wireline_user_id?.trim();
    if (boundUserId && boundUserId !== userId) {
      log.error("Stored Stripe customer belongs to a different Wireline user", {
        userId,
        customerId,
        boundUserId,
      });
      return null;
    }
    return customer.id;
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

async function ensureStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId: string | null,
  attributionMetadata: Record<string, string>,
): Promise<{ id: string; recovered: boolean }> {
  if (existingCustomerId) {
    const reusableId = await reusableStripeCustomerId(existingCustomerId, userId);
    if (reusableId) {
      if (Object.keys(attributionMetadata).length) {
        try {
          await stripe.customers.update(reusableId, {
            metadata: { wireline_user_id: userId, ...attributionMetadata },
          });
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error;
          // The customer was deleted between validation and update. Fall
          // through to the deterministic recovery create below.
        }
      } else {
        return { id: reusableId, recovered: false };
      }

      const stillReusable = await reusableStripeCustomerId(reusableId, userId);
      if (stillReusable) return { id: stillReusable, recovered: false };
    }
  }

  const idempotencyKey = existingCustomerId
    ? `wireline-customer-recovery-${userId}-${existingCustomerId}`
    : `wireline-customer-${userId}`;
  const customer = await stripe.customers.create(
    {
      email,
      metadata: { wireline_user_id: userId, ...attributionMetadata },
    },
    { idempotencyKey },
  );
  return { id: customer.id, recovered: Boolean(existingCustomerId) };
}

async function persistStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await drizzle
    .insert(schema.subscriptions)
    .values({ userId, stripeCustomerId: customerId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.subscriptions.userId,
      set: { stripeCustomerId: customerId, updatedAt: new Date() },
    });
}

function isAmbiguousStripeError(error: unknown): boolean {
  const candidate = error as { type?: unknown; statusCode?: unknown };
  const type = typeof candidate?.type === "string" ? candidate.type : "";
  const statusCode =
    typeof candidate?.statusCode === "number" && Number.isFinite(candidate.statusCode)
      ? candidate.statusCode
      : null;
  if (type === "StripeConnectionError") return true;
  // A 409 idempotency conflict means a concurrent request is still in flight
  // with this exact key; its outcome will materialize on the durable operation,
  // so this request must stay resumable rather than marking anything failed.
  if (type === "StripeIdempotencyError" || statusCode === 409) return true;
  if (statusCode === null) return true;
  return statusCode === 429 || statusCode >= 500;
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
      const reusableCustomerId = await reusableStripeCustomerId(
        existing.stripeCustomerId,
        req.user.id,
      );
      if (reusableCustomerId) {
        try {
          const remote = await stripe.subscriptions.list({
            customer: reusableCustomerId,
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
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error;
          // The customer disappeared after validation. The durable checkout
          // operation below will recover it with a deterministic create key.
        }
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

    const [createdOperation] = await drizzle
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

    let operationId = createdOperation?.id || null;
    let operationCustomerId: string | null = null;
    let resumed = false;

    if (!operationId) {
      const [active] = await drizzle
        .select({
          id: checkoutOperations.id,
          planId: checkoutOperations.planId,
          billingInterval: checkoutOperations.billingInterval,
          status: checkoutOperations.status,
          stripeCustomerId: checkoutOperations.stripeCustomerId,
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
      if (
        active?.status === "creating" &&
        active.planId === plan.id &&
        active.billingInterval === interval
      ) {
        operationId = active.id;
        operationCustomerId = active.stripeCustomerId || null;
        resumed = true;
      } else {
        return res.status(409).json({
          code: "CHECKOUT_ALREADY_IN_PROGRESS",
          error:
            active?.status === "open"
              ? "A different checkout is already open. Complete or cancel it before choosing another plan."
              : "Checkout is already being prepared for a different plan. Try again after it completes.",
          operation_id: active?.id,
        });
      }
    }

    let customerId: string | null = null;
    let customerResolved = false;
    let checkoutAttempted = false;
    let checkoutResolved = false;
    let createdSession: { id: string; url: string } | null = null;

    try {
      const ensuredCustomer = await ensureStripeCustomer(
        req.user.id,
        req.user.email,
        operationCustomerId || existing?.stripeCustomerId || null,
        attributionMetadata,
      );
      customerId = ensuredCustomer.id;
      customerResolved = true;

      // Persist to the durable operation first. If the subscription projection
      // write fails, the same active operation can resume with this exact
      // customer instead of creating another Stripe object.
      await markCheckoutOperation(operationId, {
        status: "creating",
        stripeCustomerId: customerId,
        failureCode: null,
      });
      await persistStripeCustomerId(req.user.id, customerId);

      if (ensuredCustomer.recovered) {
        log.warn("Recovered checkout from a stale Stripe customer reference", {
          userId: req.user.id,
          operationId,
          customerId,
        });
      }

      checkoutAttempted = true;
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
      checkoutResolved = true;
      if (!session.url) throw new Error("Stripe Checkout returned no hosted URL");
      createdSession = { id: session.id, url: session.url };

      await markCheckoutOperation(operationId, {
        status: "open",
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: createdSession.id,
        checkoutUrl: createdSession.url,
        failureCode: null,
      });

      emitServerProductEvent({
        event: "subscription_checkout_started",
        userId: req.user.id,
        planId: plan.id,
        metadata: {
          interval,
          catalog_version: FOUNDER_CATALOG_VERSION,
          checkout_session_id: createdSession.id,
          checkout_operation_id: operationId,
          resumed,
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
            resumed,
          },
        })
        .catch((error) =>
          log.warn("billing audit log failed", {
            event: "checkout_started",
            error: getErrorMessage(error),
          }),
        );

      return res.json({
        url: createdSession.url,
        operation_id: operationId,
        ...(resumed ? { resumed: true } : {}),
      });
    } catch (error) {
      if (createdSession) {
        await markCheckoutOperation(operationId, {
          status: "open",
          stripeCustomerId: customerId,
          stripeCheckoutSessionId: createdSession.id,
          checkoutUrl: createdSession.url,
          failureCode: "post_stripe_persistence_failed",
        }).catch(() => {});
        log.error("Stripe Checkout exists but operation persistence failed", {
          operationId,
          sessionId: createdSession.id,
          userId: req.user.id,
          error: getErrorMessage(error),
        });
        return res.json({
          url: createdSession.url,
          operation_id: operationId,
          warning: "Checkout is ready; Wireline is reconciling its local billing record.",
        });
      }

      if (customerResolved && !checkoutAttempted) {
        await markCheckoutOperation(operationId, {
          status: "creating",
          stripeCustomerId: customerId,
          failureCode: "customer_state_persistence_failed",
        }).catch(() => {});
        log.warn("Stripe customer resolved but local checkout state is still reconciling", {
          operationId,
          userId: req.user.id,
          customerId,
          error: getErrorMessage(error),
        });
        return res.status(202).json({
          code: "CHECKOUT_RECONCILING",
          error:
            "Your billing profile is ready, but Wireline is reconciling local checkout state. Retry the same plan safely.",
          operation_id: operationId,
        });
      }

      if (!checkoutAttempted && isAmbiguousStripeError(error)) {
        await markCheckoutOperation(operationId, {
          status: "creating",
          stripeCustomerId: customerId,
          failureCode: "stripe_customer_outcome_unknown",
        }).catch(() => {});
        log.warn("Stripe customer outcome is ambiguous; checkout remains resumable", {
          operationId,
          userId: req.user.id,
          error: getErrorMessage(error),
        });
        return res.status(202).json({
          code: "CHECKOUT_RECONCILING",
          error:
            "Stripe did not return a definitive billing-profile result. Retry the same plan to resume safely.",
          operation_id: operationId,
        });
      }

      if (checkoutAttempted && !checkoutResolved && isAmbiguousStripeError(error)) {
        await markCheckoutOperation(operationId, {
          status: "creating",
          stripeCustomerId: customerId,
          failureCode: "stripe_checkout_outcome_unknown",
        }).catch(() => {});
        log.warn("Stripe Checkout outcome is ambiguous; operation remains resumable", {
          operationId,
          userId: req.user.id,
          error: getErrorMessage(error),
        });
        return res.status(202).json({
          code: "CHECKOUT_RECONCILING",
          error:
            "Stripe did not return a definitive result. Retry the same plan to resume this checkout safely.",
          operation_id: operationId,
        });
      }

      await failCheckoutOperation(operationId, {
        stripeCustomerId: customerId,
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
