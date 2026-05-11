import Stripe from "stripe";
import { db, log, auditLogger } from "./server-context";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover" as any,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
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
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
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
