import Stripe from "stripe";
import { drizzle, log, auditLogger } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { planByStripePrice, type StripePlan } from "./plan-catalog";
import { dispatchWebhook } from "./webhook-helpers";
import { invalidateDashboard } from "./dashboard-cache";

export const STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion;

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** True when meter event name + tier overage price are configured for invoicing. */
export function voiceOverageBillingConfigured(plan: StripePlan): boolean {
  if (!process.env.STRIPE_VOICE_OVERAGE_METER_EVENT_NAME) return false;
  if (!plan.overagePriceIdEnv) return false;
  return !!process.env[plan.overagePriceIdEnv];
}

/**
 * Checkout line items: flat subscription price + optional metered voice-overage price.
 * Overage price is monthly metered even when the base plan is annual.
 */
export function subscriptionCheckoutLineItems(
  plan: StripePlan,
  interval: "month" | "year",
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const priceEnvKey = interval === "year" ? plan.annualPriceIdEnv : plan.priceIdEnv;
  const priceId = process.env[priceEnvKey];
  if (!priceId) return [];

  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];

  if (voiceOverageBillingConfigured(plan)) {
    const overagePriceId = process.env[plan.overagePriceIdEnv!];
    if (overagePriceId) {
      items.push({ price: overagePriceId });
    }
  }

  return items;
}

/**
 * Emit a Stripe Meter Event for voice-minute overage. NO-OP unless both
 * STRIPE_SECRET_KEY and STRIPE_VOICE_OVERAGE_METER_EVENT_NAME are set —
 * lets us ship usage tracking + visible UI before configuring the Stripe
 * Meter + metered Price in the dashboard.
 *
 * Stripe setup (automated via scripts/setup-stripe-catalog.mjs):
 *   1. Billing → Meters → voice_minutes_overage (SUM aggregation)
 *   2. Per-tier metered prices at each plan's overage_per_min_usd
 *   3. Checkout attaches flat + overage prices on new subscriptions
 *   4. STRIPE_VOICE_OVERAGE_METER_EVENT_NAME=voice_minutes_overage
 */
export async function emitVoiceMinuteOverageEvent(opts: {
  customerId: string;
  minutes: number;
  /** Stable per-call id — used as the Stripe meter idempotency key. */
  vapiCallId: string;
}): Promise<void> {
  const eventName = process.env.STRIPE_VOICE_OVERAGE_METER_EVENT_NAME;
  if (!eventName || !stripeAvailable() || opts.minutes <= 0) return;

  await stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: {
      stripe_customer_id: opts.customerId,
      value: String(opts.minutes),
    },
    identifier: `voice_overage_${opts.vapiCallId}`,
  });
}

/** Sync a Stripe subscription into wireline_subscriptions + wireline_settings (plan, max_agents, status gates). */
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
      ?.map((item) => planByStripePrice(item.price))
      .find((p): p is StripePlan => !!p) ?? null;
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
      userId: userId,
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
      // settings.id is a text PK with no default; the convention is id = userId.
      id: userId,
      userId: userId,
      subscriptionStatus: localStatus,
      maxAgents: plan?.max_agents ?? 3,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.settings.userId],
      set: {
        subscriptionStatus: localStatus,
        maxAgents: plan?.max_agents ?? 3,
        updatedAt: new Date(),
      },
    });

  const { ensureDefaultAiSpendBudget } = await import("./workspace-usage-snapshot");
  await ensureDefaultAiSpendBudget(userId, plan?.id ?? null);

  invalidateDashboard(userId);

  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id ?? null,
    voice_number_slots_cap: plan?.max_agents ?? null,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: currentPeriodEndIso,
    at: new Date().toISOString(),
  }).catch((e: unknown) =>
    log.warn("subscription.changed webhook dispatch failed", { userId, error: getErrorMessage(e) }),
  );

  const billingAction: "subscription_created" | "subscription_updated" | "subscription_cancelled" =
    stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
      ? "subscription_cancelled"
      : (sub as Stripe.Subscription & { _auditCreate?: boolean })._auditCreate
        ? "subscription_created"
        : "subscription_updated";

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
      },
    })
    .catch(() => {});
}
