import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";

/**
 * Resolve Stripe-stamped tenant identity only to a user that still exists.
 *
 * Stripe can redeliver subscription and Checkout events long after BotBound
 * has completed an account erasure. Treating event metadata as proof of a
 * live tenant would let a late event recreate billing projections or wallet
 * state for the deleted account. This root-scoped existence check is the
 * shared admission boundary for those webhook repair paths; database foreign
 * keys remain the final race-safe guard if deletion commits immediately after
 * this read.
 */
export async function stripeOwnerUserExists(userId: string): Promise<boolean> {
  const [owner] = await drizzle
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return !!owner;
}
