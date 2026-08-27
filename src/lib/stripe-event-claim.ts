import { randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** Must exceed api/index.ts maxDuration (600s) with a shutdown cushion. */
export const STRIPE_EVENT_CLAIM_LEASE_MS = 15 * 60 * 1000;
const STRIPE_EVENT_CLAIM_LEASE_SECONDS = STRIPE_EVENT_CLAIM_LEASE_MS / 1000;

export interface StripeEventClaimOwnership {
  eventId: string;
  eventType: string;
  claimToken: string;
}

export type StripeEventClaimResult =
  | { kind: "claimed"; claim: StripeEventClaimOwnership }
  | { kind: "already_processed" }
  | { kind: "in_flight" };

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505" || /duplicate key|23505/i.test(getErrorMessage(error));
}

async function insertClaim(eventId: string, eventType: string): Promise<StripeEventClaimOwnership> {
  const claim: StripeEventClaimOwnership = {
    eventId,
    eventType,
    claimToken: randomUUID(),
  };
  await drizzle.insert(schema.stripeEvents).values({
    eventId,
    eventType,
    status: "processing",
    claimToken: claim.claimToken,
  });
  return claim;
}

/**
 * Claim one Stripe event, reclaiming only a database-confirmed abandoned lease.
 * Migration 0164 owns the atomic INSERT-boundary reclaim; the conditional
 * fallback keeps retry behavior fail-safe if that trigger is temporarily
 * missing while schema drift is being repaired.
 */
export async function claimStripeEvent(
  eventId: string,
  eventType: string,
): Promise<StripeEventClaimResult> {
  try {
    return { kind: "claimed", claim: await insertClaim(eventId, eventType) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const [prior] = await drizzle
    .select({ status: schema.stripeEvents.status })
    .from(schema.stripeEvents)
    .where(eq(schema.stripeEvents.eventId, eventId))
    .limit(1);
  if (prior?.status === "processed") return { kind: "already_processed" };
  if (prior?.status !== "processing") return { kind: "in_flight" };

  const reclaimed = await drizzle
    .delete(schema.stripeEvents)
    .where(
      and(
        eq(schema.stripeEvents.eventId, eventId),
        eq(schema.stripeEvents.status, "processing"),
        or(
          isNull(schema.stripeEvents.processedAt),
          sql`${schema.stripeEvents.processedAt} < clock_timestamp() - make_interval(secs => ${STRIPE_EVENT_CLAIM_LEASE_SECONDS})`,
        ),
      ),
    )
    .returning({ eventId: schema.stripeEvents.eventId });
  if (reclaimed.length === 0) return { kind: "in_flight" };

  try {
    return { kind: "claimed", claim: await insertClaim(eventId, eventType) };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "in_flight" };
    throw error;
  }
}

/** Complete only the attempt that still owns this event. */
export async function completeStripeEventClaim(claim: StripeEventClaimOwnership): Promise<void> {
  const [completed] = await drizzle
    .update(schema.stripeEvents)
    .set({ status: "processed", processedAt: new Date(), claimToken: null })
    .where(
      and(
        eq(schema.stripeEvents.eventId, claim.eventId),
        eq(schema.stripeEvents.status, "processing"),
        eq(schema.stripeEvents.claimToken, claim.claimToken),
      ),
    )
    .returning({ eventId: schema.stripeEvents.eventId });
  if (!completed) {
    throw new Error(`Stripe event ${claim.eventId} lost claim ownership before completion.`);
  }
}

/** Release only the failed attempt's lease; never delete a successor claim. */
export async function releaseStripeEventClaim(claim: StripeEventClaimOwnership): Promise<boolean> {
  const released = await drizzle
    .delete(schema.stripeEvents)
    .where(
      and(
        eq(schema.stripeEvents.eventId, claim.eventId),
        eq(schema.stripeEvents.status, "processing"),
        eq(schema.stripeEvents.claimToken, claim.claimToken),
      ),
    )
    .returning({ eventId: schema.stripeEvents.eventId });
  return released.length > 0;
}
