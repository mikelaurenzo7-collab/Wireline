/**
 * Voice numbers: while subscription is active, the tenant may provision up to
 * one dedicated line per agent seat on their plan (tier `max_agents`).
 */

import { db } from "./server-context";
import { stripeAvailable } from "./stripe-helpers";
import { planById } from "./plan-catalog";

export async function getIncludedPhoneLineSlots(userId: string): Promise<number> {
  const { data: settings } = await db
    .from("wireline_settings")
    .select("subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const subStatus = settings?.subscription_status || "active";
  if (subStatus !== "active") return 0;

  const { data: sub } = await db.from("wireline_subscriptions").select("plan").eq("user_id", userId).maybeSingle();
  const tier = planById(sub?.plan || undefined);
  if (tier) return tier.max_agents;

  if (!stripeAvailable()) return 999;

  return 1;
}
