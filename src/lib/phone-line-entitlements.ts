/**
 * Voice numbers: while subscription is active, the tenant may provision up to
 * `included_phone_numbers` on their plan (aligned with agent seats).
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { stripeAvailable } from "./stripe-helpers";
import { planById } from "./plan-catalog";

export async function getIncludedPhoneLineSlots(userId: string): Promise<number> {
  const [settings] = await drizzle
    .select({ subscriptionStatus: schema.settings.subscriptionStatus })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  const subStatus = settings?.subscriptionStatus || "active";
  if (subStatus !== "active") return 0;

  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  const tier = planById(sub?.plan || undefined);
  if (tier) return tier.included_phone_numbers;

  if (!stripeAvailable()) return 999;

  return 1;
}
