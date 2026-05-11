import Stripe from "stripe";
import { db, log, auditLogger } from "./server-context";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover" as any,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
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
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  
  // Find the user by stripe_customer_id
  const { data: current } = await db.from("wireline_subscriptions")
    .select("user_id, status")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!current?.user_id) {
    log.warn("Stripe sync: No local user found for customer", { customerId });
    return;
  }

  const { error } = await db.from("wireline_subscriptions").upsert({
    user_id: current.user_id,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan_id: sub.items.data[0]?.price.id,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: (() => {
      const end = getSubscriptionCurrentPeriodEnd(sub);
      return end ? new Date(end * 1000).toISOString() : null;
    })(),
  }, { onConflict: "user_id" });

  if (error) {
    log.error("Stripe sync failed", { userId: current.user_id, error: error.message });
    throw error;
  }

  // Also sync the simplified status to wireline_settings for legacy reasons.
  // 'active', 'trialing' -> 'active'
  // 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired' -> 'inactive'
  const simplifiedStatus = ["active", "trialing"].includes(sub.status) ? "active" : "inactive";
  await db.from("wireline_settings")
    .update({ subscription_status: simplifiedStatus })
    .eq("user_id", current.user_id);

  if ((sub as any)._auditCreate) {
    void auditLogger.logBilling('subscription_created', {
      userId: current.user_id,
      customerId,
      metadata: { subscription_id: sub.id, plan_id: sub.items.data[0]?.price.id },
    }).catch(() => {});
  } else if (current.status !== sub.status) {
    void auditLogger.logBilling('subscription_updated', {
      userId: current.user_id,
      customerId,
      metadata: { old_status: current.status, new_status: sub.status, subscription_id: sub.id },
    }).catch(() => {});
  }
}
