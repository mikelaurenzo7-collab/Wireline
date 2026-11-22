import { eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";

/**
 * One user's preferences are a single JSON envelope shared by several
 * features (Company Identity, texting registration, post-call outputs,
 * connected-app permissions...). A writer that reads the envelope, changes
 * its own key and writes the whole envelope back must hold this lock for the
 * read too, or a concurrent writer's committed change is silently undone.
 * `FOR UPDATE` alone only delays the write; the advisory lock also covers a
 * user who has no preferences row yet.
 */

type Executor = Pick<typeof drizzle, "execute">;
type Transaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

export type PreferenceEnvelope = Record<string, unknown>;

export function preferenceEnvelopeOf(value: unknown): PreferenceEnvelope {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as PreferenceEnvelope) }
    : {};
}

/** Take the shared envelope lock inside the caller's transaction. */
export async function lockPreferenceEnvelope(tx: Executor, userId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('company-identity'), hashtext(${userId}))`,
  );
  await tx.execute(
    sql`SELECT user_id FROM wireline_user_preferences WHERE user_id = ${userId} FOR UPDATE`,
  );
}

/**
 * Read, change and write one user's envelope under the shared lock in one
 * transaction. `change` edits the envelope in place and returns its result.
 */
export async function updatePreferenceEnvelope<T>(
  userId: string,
  change: (envelope: PreferenceEnvelope, tx: Transaction) => T | Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await lockPreferenceEnvelope(tx, userId);
    const [row] = await tx
      .select({ preferences: schema.userPreferences.preferences })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1);
    const envelope = preferenceEnvelopeOf(row?.preferences);
    const result = await change(envelope, tx);
    await tx
      .insert(schema.userPreferences)
      .values({ userId, preferences: envelope, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: { preferences: envelope, updatedAt: new Date() },
      });
    return result;
  });
}
