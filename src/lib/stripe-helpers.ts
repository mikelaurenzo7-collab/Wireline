import Stripe from "stripe";
import { drizzle, log, auditLogger } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { planByPriceId } from "./plan-catalog";
import { dispatchWebhook } from "./webhook-helpers";
import { invalidateDashboard } from "./dashboard-cache";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Emit a Stripe Meter Event for voice-minute overage. NO-OP unless both
 * STRIPE_SECRET_KEY and STRIPE_VOICE_OVERAGE_METER_EVENT_NAME are set —
 * lets us ship usage tracking + visible UI before configuring the Stripe
 * Meter + metered Price in the dashboard.
 *
 * Stripe setup steps (one-time, in Stripe Dashboard):
 *   1. Billing → Meters → Create meter. Event name: voice_minutes_overage
 *      (must match STRIPE_VOICE_OVERAGE_METER_EVENT_NAME). Aggregation: SUM.
 *   2. For each plan price (Starter/Pro/Business), add a metered price
 *      tied to the meter at the tier's overage rate ($0.20/$0.18/$0.16).
 *   3. When you create checkout sessions, attach BOTH the flat price and
 *      the metered overage price as line items.
 *   4. Set STRIPE_VOICE_OVERAGE_METER_EVENT_NAME=voice_minutes_overage
 *      in Vercel. Overage events will start flowing from production calls.
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
    // Stable identifier — Stripe collapses duplicates on this key. Vapi
    // retries that somehow bypass the call_logs unique constraint will
    // still collapse here, so we never double-bill the same call.
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
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const plan = planByPriceId(priceId);
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

  // Plan / max_agents changes mutate dashboard stats — clear the cache so the
  // operator sees the new tier immediately instead of waiting up to 60s.
  invalidateDashboard(userId);

  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id ?? null,
    /** Same as tier max_agents: one provisioned voice number per purchased agent seat. */
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
