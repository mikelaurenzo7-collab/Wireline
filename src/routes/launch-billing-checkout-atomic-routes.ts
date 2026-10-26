import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, isUsagePlanId, planById, planPriceId } from "../lib/plan-catalog";
import {
  USAGE_CATALOG_VERSION,
  isUsageTierId,
  DEFAULT_PUBLIC_USAGE_TIER,
  type UsageTierId,
} from "../lib/usage-billing-catalog";
import {
  checkoutConfigurationKey,
  validateUsageCheckoutAddons,
} from "../lib/checkout-configuration";
import {
  usageBillingEnabled,
  usageCheckoutConfigured,
  usagePriceId,
} from "../lib/usage-billing-config";
import { drizzle, auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  isMissingStripeResource,
  stripe,
  stripeAvailable,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
} from "../lib/stripe-helpers";
import type Stripe from "stripe";
import { authenticateUser } from "../middleware/auth";
import { fencePayableBillingDuringAccountDeletion } from "../middleware/account-deletion-billing-fence";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceVerifiedEmailForCheckout } from "../lib/trial-gate";
import { checkoutOperations } from "../db/security-schema";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";
import { emitServerProductEvent } from "../lib/product-event-server";
import { fulfillStripeCheckoutSession } from "../lib/stripe-checkout-fulfillment";
import { resolveStrictFounderPriceId } from "../lib/stripe-founder-price";
import { resolveOwnedStripeCustomer } from "../lib/stripe-customer-binding";
import { findPotentiallyLiveStripeSubscription } from "../lib/stripe-subscription-safety";
import {
  assertBotBoundStripeAccount,
  validateUsageCheckoutCatalog,
} from "../lib/usage-stripe-validation";

const router = Router();

/** Most of one add-on a single checkout may buy; more is a support conversation. */
const MAX_USAGE_ADDON_QUANTITY = 20;

function usageAddonQuantity(value: unknown): number {
  if (value === true) return 1;
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, MAX_USAGE_ADDON_QUANTITY);
}

/**
 * Usage plan line items: the base, one metered item per meter (no quantity),
 * and only the add-ons the owner chose. A number exists only when calling is
 * chosen; a BotBound email address only when the owner asks for one.
 */
export function usageCheckoutLineItems(
  addons: { numbers: number; emailAddresses: number },
  env: NodeJS.ProcessEnv = process.env,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const required = (key: Parameters<typeof usagePriceId>[0]) => {
    const id = usagePriceId(key, env, tier);
    if (!id) throw new Error(`Usage price ${key} is not configured`);
    return id;
  };
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: required("base"), quantity: 1 },
    { price: required("work") },
  ];
  if (addons.numbers > 0) items.push({ price: required("number"), quantity: addons.numbers });
  if (addons.emailAddresses > 0) {
    items.push({ price: required("email_address"), quantity: addons.emailAddresses });
  }
  return items;
}
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

async function ensureStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId: string | null,
  attributionMetadata: Record<string, string>,
): Promise<{ id: string; recovered: boolean }> {
  if (existingCustomerId) {
    const reusable = await resolveOwnedStripeCustomer({
      customerId: existingCustomerId,
      userId,
      authenticatedEmail: email,
      metadata: attributionMetadata,
    });
    if (reusable) return { id: reusable.id, recovered: false };
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
  enforceVerifiedEmailForCheckout,
  fencePayableBillingDuringAccountDeletion,
  async (req: AuthenticatedRequest, res: Response) => {
    const requestedPlanId = String(req.body?.plan_id || "").trim();
    const interval = req.body?.interval === "year" ? "year" : "month";
    const plan = planById(requestedPlanId);
    if (!plan) throw AppError.fromHttpStatus(400, "Unknown plan_id.");
    const usageCheckout = isUsagePlanId(plan.id);
    const tier: UsageTierId = req.body?.usage_tier ?? DEFAULT_PUBLIC_USAGE_TIER;
    if (usageCheckout) {
      if ((tier as string) === "starter" || tier === "previous")
        throw AppError.badRequest(
          "This offer has been replaced. Choose a current plan on Pricing.",
        );
      if (!isUsageTierId(tier)) throw AppError.badRequest("Choose a valid plan.");
      // Dark until USAGE_BILLING_ENABLED and every usage price id are set.
      if (!usageBillingEnabled() || !usageCheckoutConfigured(process.env, tier)) {
        return res.status(503).json({
          code: "USAGE_CHECKOUT_UNAVAILABLE",
          error: "This plan is not available for checkout yet.",
        });
      }
      if (interval !== "month") {
        return res.status(400).json({
          code: "USAGE_PLAN_MONTHLY_ONLY",
          error: "This plan is billed monthly.",
        });
      }
    }
    const usageAddons = usageCheckout
      ? {
          numbers: usageAddonQuantity(req.body?.addons?.number),
          emailAddresses: usageAddonQuantity(req.body?.addons?.email_address),
        }
      : { numbers: 0, emailAddresses: 0 };
    if (usageCheckout) validateUsageCheckoutAddons(usageAddons, tier);
    if (
      (usageAddons.numbers > 0 && !usagePriceId("number")) ||
      (usageAddons.emailAddresses > 0 && !usagePriceId("email_address"))
    ) {
      return res.status(503).json({
        code: "USAGE_ADDON_UNAVAILABLE",
        error: "That add-on is not available for checkout yet.",
      });
    }
    if (!usageCheckout && plan.public === false) {
      return res.status(410).json({
        code: "LEGACY_PLAN_RETIRED",
        error:
          "This plan is retained for existing subscriptions. Choose the channels you need for a new subscription.",
        replacement: "voice",
        contact_sales: "/contact?topic=enterprise",
      });
    }
    if (plan.price_usd_monthly === 0) {
      return res.status(400).json({
        code: "FREE_PLAN_NO_CHECKOUT",
        error: "This plan does not require checkout.",
      });
    }
    if (plan.checkoutAvailability !== "available") {
      return res.status(409).json({
        code: "CHANNEL_SETUP_UNAVAILABLE",
        error:
          "SMS plans check out once sender registration is confirmed for your account. Registration charges and carrier readiness are confirmed first.",
      });
    }

    if (plan.catalogFamily === "channels" && !planPriceId(plan, interval)) {
      return res.status(503).json({
        code: "CHANNEL_CHECKOUT_UNAVAILABLE",
        error: "This package is not available for checkout yet.",
      });
    }

    if (!stripeAvailable())
      throw AppError.fromHttpStatus(503, "Billing is temporarily unavailable.");
    try {
      await assertBotBoundStripeAccount(stripe);
    } catch (error) {
      log.error("Checkout refused: Stripe account is not the BotBound merchant", {
        message: getErrorMessage(error),
      });
      throw new AppError(503, "USAGE_PRICE_MISMATCH", "Billing is temporarily unavailable.");
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
        error:
          "You already have a subscription. To change plans, email support@botbound.app and we will move you over.",
        current_plan: existing.plan,
        current_status: existing.status,
      });
    }
    if (existing?.stripeCustomerId) {
      const reusableCustomer = await resolveOwnedStripeCustomer({
        customerId: existing.stripeCustomerId,
        userId: req.user.id,
        authenticatedEmail: req.user.email,
      });
      if (reusableCustomer) {
        try {
          const liveRemote = await findPotentiallyLiveStripeSubscription(reusableCustomer.id);
          if (liveRemote) {
            return res.status(409).json({
              code: "ALREADY_SUBSCRIBED",
              error:
                "You already have a subscription. To change plans, email support@botbound.app and we will move you over.",
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

    const priceId = usageCheckout
      ? usagePriceId("base", process.env, tier)
      : await resolveStrictFounderPriceId(plan.id, interval);
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

    if (usageCheckout) {
      try {
        await validateUsageCheckoutCatalog(stripe, process.env, tier);
      } catch (error) {
        log.error(
          "Usage checkout refused: configured Stripe price does not match the expected lookup key and amount",
          { message: getErrorMessage(error), tier },
        );
        throw new AppError(503, "USAGE_PRICE_MISMATCH", "Billing is temporarily unavailable.");
      }
    }
    const lineItems = usageCheckout
      ? usageCheckoutLineItems(usageAddons, process.env, tier)
      : [{ price: priceId, quantity: 1 }];
    const configurationKey = usageCheckout
      ? checkoutConfigurationKey(plan.id, interval, lineItems)
      : null;

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
        configurationKey,
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
          configurationKey: checkoutOperations.configurationKey,
          status: checkoutOperations.status,
          stripeCustomerId: checkoutOperations.stripeCustomerId,
          stripeCheckoutSessionId: checkoutOperations.stripeCheckoutSessionId,
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
      const samePlan =
        active?.planId === plan.id &&
        active?.billingInterval === interval &&
        (!usageCheckout || active.configurationKey === configurationKey);
      if (active?.status === "open" && active.checkoutUrl) {
        // Ask Stripe whether the cached session is still payable before
        // deciding anything. The webhook now completes operations, but a
        // lagging or dropped delivery would otherwise hand back a consumed
        // session's dead URL (subscribe → cancel → retry within the 24h TTL)
        // or 409-brick every other plan until the TTL sweep.
        let remoteStatus: Stripe.Checkout.Session.Status | null = null;
        if (active.stripeCheckoutSessionId) {
          try {
            const remoteSession = await stripe.checkout.sessions.retrieve(
              active.stripeCheckoutSessionId,
            );
            remoteStatus = remoteSession.status;
          } catch (error) {
            if (!isMissingStripeResource(error)) throw error;
          }
        }
        if (samePlan && remoteStatus === "open") {
          return res.json({ url: active.checkoutUrl, reused: true, operation_id: active.id });
        }
        if (remoteStatus === "open" && active.stripeCheckoutSessionId) {
          // Different plan requested while the old session is still payable:
          // expire it at Stripe FIRST so the superseded URL can never be paid
          // after the new one exists.
          try {
            await stripe.checkout.sessions.expire(active.stripeCheckoutSessionId);
          } catch {
            // The session can complete between retrieve and expire. Bail to
            // the safe answer instead of racing a payment in flight.
            return res.status(409).json({
              code: "CHECKOUT_ALREADY_IN_PROGRESS",
              error:
                "A different checkout is already open. Complete or cancel it before choosing another plan.",
              operation_id: active.id,
            });
          }
        }
        await drizzle
          .update(checkoutOperations)
          .set({
            status: remoteStatus === "complete" ? "completed" : "expired",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(checkoutOperations.id, active.id),
              inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES),
            ),
          );
        const [renewed] = await drizzle
          .insert(checkoutOperations)
          .values({
            userId: req.user.id,
            planId: plan.id,
            billingInterval: interval,
            configurationKey,
            status: "creating",
            expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
          })
          .onConflictDoNothing()
          .returning({ id: checkoutOperations.id });
        operationId = renewed?.id || null;
        if (!operationId) {
          return res.status(409).json({
            code: "CHECKOUT_ALREADY_IN_PROGRESS",
            error: "Another checkout request is being prepared. Try again in a moment.",
          });
        }
      } else if (active?.status === "creating" && samePlan) {
        operationId = active.id;
        operationCustomerId = active.stripeCustomerId || null;
        resumed = true;
      } else {
        return res.status(409).json({
          code: "CHECKOUT_ALREADY_IN_PROGRESS",
          error:
            "Checkout is already being prepared for a different plan. Try again after it completes.",
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
          integration_identifier: stripeCheckoutIntegrationIdentifier("plan", operationId),
          customer: customerId,
          customer_update: { address: "auto" },
          ...stripeCheckoutTaxConfig(),
          line_items: lineItems,
          success_url: `${appUrl.url}/settings/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl.url}/settings/billing?billing=canceled`,
          allow_promotion_codes: true,
          client_reference_id: req.user.id,
          metadata: {
            wireline_user_id: req.user.id,
            wireline_checkout_operation_id: operationId,
            wireline_plan: plan.id,
            wireline_catalog_version: usageCheckout
              ? USAGE_CATALOG_VERSION
              : FOUNDER_CATALOG_VERSION,
          },
          subscription_data: {
            metadata: {
              wireline_user_id: req.user.id,
              wireline_checkout_operation_id: operationId,
              wireline_plan: plan.id,
              wireline_catalog_version: usageCheckout
                ? USAGE_CATALOG_VERSION
                : FOUNDER_CATALOG_VERSION,
              // Usage: metered work billed in arrears, never above the owner's limit.
              overage_policy: usageCheckout ? "metered_with_customer_cap" : "prepaid_balance_only",
              ...(usageCheckout
                ? {
                    usage_number_addons: String(usageAddons.numbers),
                    usage_tier: tier,
                    usage_email_address_addons: String(usageAddons.emailAddresses),
                  }
                : {}),
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
          warning: "Checkout is ready; BotBound is reconciling its local billing record.",
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
            "Your billing profile is ready, but BotBound is reconciling local checkout state. Retry the same plan safely.",
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
            "Billing did not return a definitive account result. Retry the same plan to resume safely.",
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
            "Checkout did not return a definitive result. Retry the same plan to resume safely.",
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

/**
 * Success-redirect reconciliation. Entitlement delivery otherwise depends
 * entirely on webhook delivery: if the endpoint or secret is misconfigured, or
 * delivery fails past Stripe's retry window, a customer pays and receives
 * nothing with no repair path. The success redirect already carries
 * session_id, so the paying browser proves its own session here and pulls
 * entitlements synchronously. Every write is shared with (and idempotent
 * against) the webhook: the same subscription sync and the same operation
 * completion.
 */
router.post(
  "/api/billing/checkout/verify",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!stripeAvailable())
      throw AppError.fromHttpStatus(503, "Billing is temporarily unavailable.");
    try {
      await assertBotBoundStripeAccount(stripe);
    } catch (error) {
      log.error("Checkout verify refused: Stripe account is not the BotBound merchant", {
        message: getErrorMessage(error),
      });
      throw new AppError(503, "USAGE_PRICE_MISMATCH", "Billing is temporarily unavailable.");
    }
    const sessionId = String(req.body?.session_id || "").trim();
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw AppError.fromHttpStatus(400, "A Stripe checkout session id is required.");
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (isMissingStripeResource(error)) {
        throw AppError.fromHttpStatus(404, "Unknown checkout session.");
      }
      throw error;
    }

    const sessionUserId =
      session.metadata?.wireline_user_id?.trim() || session.client_reference_id || "";
    if (sessionUserId !== req.user.id) {
      // Same shape as a nonexistent id — do not reveal foreign sessions.
      throw AppError.fromHttpStatus(404, "Unknown checkout session.");
    }

    const fulfillment = await fulfillStripeCheckoutSession(session, {
      providerEventId: `checkout_verify:${session.id}`,
    });

    return res.json({
      status: session.status,
      payment_status: session.payment_status,
      synced: fulfillment.subscriptionSynced,
      credit_granted: fulfillment.creditGranted,
      live_video_enabled: fulfillment.liveVideoEnabled,
    });
  },
);

export default router;
