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

const configuredStripeSecret = String(process.env.STRIPE_SECRET_KEY || "").trim();
const previewAllowsLiveProviders =
  process.env.WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW === "true";
const stripeBlockedInPreview =
  process.env.VERCEL_ENV === "preview" &&
  configuredStripeSecret.startsWith("sk_live_") &&
  !previewAllowsLiveProviders;

if (stripeBlockedInPreview) {
  // Defense in depth: Vercel can inherit production-scoped values into a preview
  // project configuration. Refuse to expose live billing credentials to preview
  // routes even when the dashboard is mis-scoped.
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
}

const effectiveStripeSecret = stripeBlockedInPreview ? "" : configuredStripeSecret;

export const stripe = new Stripe(effectiveStripeSecret || "sk_test_placeholder", {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return Boolean(effectiveStripeSecret);
}

/**
 * Postpaid metered overage is intentionally retired. Variable voice, SMS,
 * enrichment, and other provider-funded work must be covered by prepaid
 * Runtime Balance instead of appearing as an unexpected invoice item.
 */
export function voiceOverageBillingConfigured(_plan: StripePlan): boolean {
  return false;
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
      (plan) =>
        planLookupKey(plan, "month") === lookupKey || planLookupKey(plan, "year") === lookupKey,
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

export function subscriptionBillingInterval(sub: Stripe.Subscription): SubscriptionBillingInterval {
  return sub.items.data.some((item) => item.price.recurring?.interval === "year")
    ? "year"
    : "month";
}

/**
 * Read the current billing period from a subscription across Stripe API
 * versions. Stripe's Basil release moved `current_period_start`/`_end` off the
 * Subscription object onto its items; the pinned runtime version is post-Basil,
 * so the fields live on `items.data[]` at runtime even though the SDK's types
 * (pre-Basil) still declare them on the subscription. Read items first, fall
 * back to the legacy top-level fields.
 */
type StripePeriodFields = {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

function subscriptionPeriod(sub: Stripe.Subscription): {
  start: number | null;
  end: number | null;
} {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & StripePeriodFields) | undefined;
  const legacy = sub as Stripe.Subscription & StripePeriodFields;
  return {
    start: item?.current_period_start ?? legacy.current_period_start ?? null,
    end: item?.current_period_end ?? legacy.current_period_end ?? null,
  };
}

/**
 * Stable period reference for the included Runtime Allowance ledger grant.
 * Stripe can replay subscription webhooks; the ledger's idempotency key ensures
 * one grant per subscription billing period even when sync runs repeatedly.
 * The period start must advance each cycle so renewals re-grant the allowance —
 * billing_cycle_anchor is constant for the subscription's life and is only a
 * last-resort fallback.
 */
function subscriptionPeriodReference(sub: Stripe.Subscription): string {
  const periodStart = subscriptionPeriod(sub).start || sub.billing_cycle_anchor || sub.created;
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
  const stripeStatus = sub.status;

  // Active/trialing Stripe status with an unmapped price must not wipe a
  // known-good plan down to null / maxAgents=1 (catalog/env drift footgun).
  if ((stripeStatus === "active" || stripeStatus === "trialing") && !plan) {
    log.error("Stripe sync: active subscription price did not map to a catalog plan — refusing overwrite", {
      userId,
      customerId,
      subscriptionId: sub.id,
      priceIds: (sub.items?.data || []).map((item) =>
        typeof item.price === "string" ? item.price : item.price?.id,
      ),
    });
    throw new Error("Stripe subscription price is not mapped to a Wireline plan catalog entry");
  }

  const baseMaxAgents = plan?.max_agents ?? 1;
  const effectiveMaxAgents = baseMaxAgents + extraAgents;

  const localStatus =
    stripeStatus === "active" || stripeStatus === "trialing"
      ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "past_due"
        : "canceled";

  const currentPeriodEndUnix = subscriptionPeriod(sub).end;
  const currentPeriodEndIso = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
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
  const spendBudgetPlanId =
    stripeStatus === "active" || stripeStatus === "trialing" ? (plan?.id ?? null) : null;
  await ensureDefaultAiSpendBudget(userId, spendBudgetPlanId);

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
    // Must succeed — swallowing here marks the webhook processed with no
    // included Runtime Allowance, and Stripe will not retry.
    await grantSubscriptionRuntimeAllowance(userId, periodReference, plan.id, interval);
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
