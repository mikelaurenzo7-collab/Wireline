import Stripe from "stripe";
import { drizzle, log, auditLogger } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import {
  STRIPE_PLANS,
  planById,
  planExtraAgentPriceId,
  planLookupKey,
  planPriceId,
  type StripePlan,
} from "./plan-catalog";
import { dispatchWebhook } from "./webhook-helpers";
import { invalidateDashboard } from "./dashboard-cache";
import {
  grantSubscriptionRuntimeAllowance,
  type SubscriptionBillingInterval,
} from "./subscription-welcome-credit";

export const STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion;

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Postpaid metered overage is intentionally retired. Variable voice, SMS,
 * enrichment, and other provider-funded work must be covered by prepaid
 * Runtime Balance instead of appearing as an unexpected invoice item.
 */
export function voiceOverageBillingConfigured(_plan: StripePlan): boolean {
  return false;
}

/** Checkout contains exactly one licensed base-plan subscription price. */
export function subscriptionCheckoutLineItems(
  plan: StripePlan,
  interval: "month" | "year",
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const priceId = planPriceId(plan, interval);
  return priceId ? [{ price: priceId, quantity: 1 }] : [];
}

/**
 * Resolve only true base-plan prices. Add-on prices can share a subscription
 * with the base plan, but must never overwrite wireline_subscriptions.plan.
 */
function basePlanByStripePrice(price: Stripe.Price | null | undefined): StripePlan | null {
  if (!price) return null;

  const metadataPlan = planById(price.metadata?.wireline_plan_id);
  if (metadataPlan) return metadataPlan;

  const lookupKey = price.lookup_key?.trim() || null;
  if (lookupKey) {
    const lookupMatch = STRIPE_PLANS.find(
      (plan) => planLookupKey(plan, "month") === lookupKey || planLookupKey(plan, "year") === lookupKey,
    );
    if (lookupMatch) return lookupMatch;
  }

  if (price.id) {
    return (
      STRIPE_PLANS.find(
        (plan) => planPriceId(plan, "month") === price.id || planPriceId(plan, "year") === price.id,
      ) || null
    );
  }

  return null;
}

function isExtraAgentPrice(price: Stripe.Price | null | undefined): boolean {
  if (!price) return false;
  if (price.metadata?.wireline_addon_id === "extra_agent") return true;
  if (price.lookup_key === "extra_agent_monthly_founder_2026_07_v3") return true;
  return STRIPE_PLANS.some((plan) => planExtraAgentPriceId(plan) === price.id);
}

function extraAgentQuantityFromSubscription(sub: Stripe.Subscription): number {
  return sub.items.data.reduce((total, item) => {
    if (!isExtraAgentPrice(item.price)) return total;
    return total + Math.max(0, item.quantity ?? 0);
  }, 0);
}

/**
 * Compatibility no-op retained for callers that still reconcile completed
 * voice usage. The runtime ledger is the billing source of truth; Stripe meter
 * events must never be emitted under the prepaid founder model.
 */
export async function emitVoiceMinuteOverageEvent(_opts: {
  customerId: string;
  minutes: number;
  vapiCallId: string;
}): Promise<void> {
  return;
}

function subscriptionBillingInterval(sub: Stripe.Subscription): SubscriptionBillingInterval {
  return sub.items.data.some((item) => item.price.recurring?.interval === "year")
    ? "year"
    : "month";
}

/**
 * Stable period reference for the included Runtime Allowance ledger grant.
 * Stripe can replay subscription webhooks; the ledger's idempotency key ensures
 * one grant per subscription billing period even when sync runs repeatedly.
 */
function subscriptionPeriodReference(sub: Stripe.Subscription): string {
  const periodStart = sub.current_period_start || sub.billing_cycle_anchor || sub.created;
  return `${sub.id}:${periodStart}`;
}

/** Sync a Stripe subscription into wireline_subscriptions + wireline_settings. */
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const [existing] = await drizzle
    .select({ userId: schema.subscriptions.userId, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (!existing?.userId) {
    log.warn("Stripe sync: no subscription row for customer — skipping mirror", { customerId });
    return;
  }

  const userId = existing.userId;
  const plan =
    sub.items?.data
      ?.map((item) => basePlanByStripePrice(item.price))
      .find((candidate): candidate is StripePlan => !!candidate) ?? null;
  const extraAgents = extraAgentQuantityFromSubscription(sub);
  const baseMaxAgents = plan?.max_agents ?? 1;
  const effectiveMaxAgents = baseMaxAgents + extraAgents;
  const stripeStatus = sub.status;

  const localStatus =
    stripeStatus === "active" || stripeStatus === "trialing"
      ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "past_due"
        : "canceled";

  const currentPeriodEndIso = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  await drizzle
    .insert(schema.subscriptions)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      plan: plan?.id ?? null,
      status: stripeStatus,
      currentPeriodEnd: currentPeriodEndIso ? new Date(currentPeriodEndIso) : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.userId],
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        plan: plan?.id ?? null,
        status: stripeStatus,
        currentPeriodEnd: currentPeriodEndIso ? new Date(currentPeriodEndIso) : null,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  await drizzle
    .insert(schema.settings)
    .values({
      id: userId,
      userId,
      subscriptionStatus: localStatus,
      maxAgents: effectiveMaxAgents,
      extraAgents,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.settings.userId],
      set: {
        subscriptionStatus: localStatus,
        maxAgents: effectiveMaxAgents,
        extraAgents,
        updatedAt: new Date(),
      },
    });

  const { ensureDefaultAiSpendBudget } = await import("./workspace-usage-snapshot");
  await ensureDefaultAiSpendBudget(userId, plan?.id ?? null);

  invalidateDashboard(userId);

  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id ?? null,
    voice_number_slots_cap: effectiveMaxAgents,
    included_extra_agents: extraAgents,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: currentPeriodEndIso,
    at: new Date().toISOString(),
  }).catch((error: unknown) =>
    log.warn("subscription.changed webhook dispatch failed", {
      userId,
      error: getErrorMessage(error),
    }),
  );

  const billingAction: "subscription_created" | "subscription_updated" | "subscription_cancelled" =
    stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
      ? "subscription_cancelled"
      : (sub as Stripe.Subscription & { _auditCreate?: boolean })._auditCreate
        ? "subscription_created"
        : "subscription_updated";

  if ((stripeStatus === "active" || stripeStatus === "trialing") && plan?.id) {
    const interval = subscriptionBillingInterval(sub);
    const periodReference = subscriptionPeriodReference(sub);
    await grantSubscriptionRuntimeAllowance(userId, periodReference, plan.id, interval).catch(
      (error: unknown) =>
        log.warn("subscription runtime allowance grant failed", {
          userId,
          planId: plan.id,
          interval,
          periodReference,
          error: getErrorMessage(error),
        }),
    );
  }

  void auditLogger
    .logBilling(billingAction, {
      userId,
      subscriptionId: sub.id,
      customerId,
      plan: plan?.id || undefined,
      metadata: {
        stripe_status: stripeStatus,
        legacy_status: localStatus,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        extra_agents: extraAgents,
      },
    })
    .catch(() => {});
}
