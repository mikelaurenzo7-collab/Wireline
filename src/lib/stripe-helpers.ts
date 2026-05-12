import Stripe from "stripe";
import { db, log, auditLogger } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { planByPriceId } from "./plan-catalog";
import { dispatchWebhook } from "./webhook-helpers";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover" as any,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

<<<<<<< Updated upstream
/** Sync a Stripe subscription into wireline_subscriptions + wireline_settings (plan, max_agents, status gates). */
=======
export type StripePlan = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  features: string[];
  // Resolved at request time so env changes don't require a restart.
  priceIdEnv: string;
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 79,
    max_agents: 3,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "3 AI agents (voice + email)",
      "Unlimited inbound calls",
      "200 outbound calls / month",
      "Daily Brief + Triage Inbox",
      "Webhooks · Intake API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 299,
    max_agents: 10,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "Unlimited outbound calls",
      "Auto-dial new leads instantly",
      "Knowledge Atlas + Insights",
      "Everything in Starter",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 1199,
    max_agents: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "100 AI agents",
      "Everything in Pro",
      "SSO + SAML",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return STRIPE_PLANS.find(p => process.env[p.priceIdEnv] === priceId) || null;
}

export function planById(id: string): StripePlan | null {
  return STRIPE_PLANS.find(p => p.id === id) || null;
}

export function plansForClient() {
  return STRIPE_PLANS.map(p => ({
    id: p.id,
    name: p.name,
    price_usd_monthly: p.price_usd_monthly,
    max_agents: p.max_agents,
    features: p.features,
    // Don't expose env var names; just whether the price is configured.
    configured: !!process.env[p.priceIdEnv],
  }));
}

/** 
 * Typed helper to extract current_period_end from a Stripe subscription.
 * In stripe@22, we read this from the first item to ensure accuracy.
 */
export function getSubscriptionCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  // Try the first item first (new source of truth in @22)
  const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemPeriodEnd === 'number') return itemPeriodEnd;
  
  // Fallback to top-level for backwards compatibility during migration
  return (sub as any).current_period_end || null;
}

/** Sync a Stripe subscription object into the local wireline_subscriptions table.
 *  Maintains the mirror state used by the rest of the app to check plan tiers. */
>>>>>>> Stashed changes
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: existing } = await db
    .from("wireline_subscriptions")
    .select("user_id, status")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!existing?.user_id) {
    log.warn("Stripe sync: no subscription row for customer — skipping mirror", { customerId });
    return;
  }

  const userId = existing.user_id;
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

  const upsertPatch: Record<string, unknown> = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: plan?.id ?? null,
    status: stripeStatus,
    current_period_end: currentPeriodEndIso,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("wireline_subscriptions").upsert(upsertPatch, { onConflict: "user_id" });

  if (error) {
    log.error("Stripe mirror upsert failed", { userId, error: error.message });
    throw error;
  }

  const settingsUpsert: Record<string, unknown> = {
    user_id: userId,
    subscription_status: localStatus,
    max_agents: plan?.max_agents ?? 3,
    updated_at: new Date().toISOString(),
  };

  await db.from("wireline_settings").upsert(settingsUpsert, { onConflict: "user_id" });

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
      : (sub as any)._auditCreate
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
