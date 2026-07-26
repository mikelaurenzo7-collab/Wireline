/**
 * Voice numbers: while subscription is active, the tenant may provision up to
 * plan included_phone_numbers plus Extra Agent add-on slots (1 number each).
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { planById } from "./plan-catalog";

/** Catalog-backed phone slots including purchased Extra Agent add-ons. */
export function includedPhoneSlotsForPlan(
  planId: string | null | undefined,
  extraAgents: number | null | undefined,
): number {
  const tier = planById(planId || undefined);
  if (!tier) return 0;
  const extras = Math.max(0, Number(extraAgents ?? 0));
  const perExtra = Math.max(0, tier.extra_agent_included_phone_numbers ?? 0);
  return Math.max(0, tier.included_phone_numbers) + extras * perExtra;
}

export async function getIncludedPhoneLineSlots(userId: string): Promise<number> {
  const [settings] = await drizzle
    .select({
      subscriptionStatus: schema.settings.subscriptionStatus,
      extraAgents: schema.settings.extraAgents,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  const subStatus = settings?.subscriptionStatus ?? "pending_activation";
  if (subStatus !== "active") return 0;

  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  const slots = includedPhoneSlotsForPlan(sub?.plan || undefined, settings?.extraAgents);
  if (slots > 0) return slots;

  // Degraded catalog lookup for an active subscriber: fail SAFE, not generous.
  // A `return 999` here let an outage hand out effectively unlimited carrier
  // numbers (real Twilio spend); cap the degraded fallback at a single slot.
  return 1;
}
