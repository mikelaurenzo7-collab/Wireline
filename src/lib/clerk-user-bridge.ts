/**
 * Upsert wireline_users from Clerk identity — keeps Postgres RLS + Stripe
 * billing keyed on wireline UUIDs while Clerk owns sign-in surfaces.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { isOwnerEmail } from "./auth-service";
import { ensureDefaultAccount } from "./account-service";

export type WirelineAuthUser = {
  id: string;
  email: string;
  full_name?: string | null;
  is_owner: boolean;
  account_type: "personal" | "business";
  account_id: string;
};

export async function findOrCreateUserFromClerkIdentity(input: {
  email: string;
  fullName: string | null;
  avatarUrl?: string | null;
  emailVerified: boolean;
}): Promise<WirelineAuthUser> {
  const normalized = input.email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Clerk user is missing a primary email");
  }

  const [existing] = await drizzle
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1);

  if (existing) {
    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (input.fullName && !existing.fullName) updates.fullName = input.fullName;
    if (input.avatarUrl && !existing.avatarUrl) updates.avatarUrl = input.avatarUrl;
    if (input.emailVerified && !existing.emailVerifiedAt) {
      updates.emailVerifiedAt = new Date();
    }
    if (Object.keys(updates).length > 0) {
      await drizzle.update(schema.users).set(updates).where(eq(schema.users.id, existing.id));
    }

    await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, existing.id))
      .limit(1);

    const account = await ensureDefaultAccount(existing.id);

    return {
      id: existing.id,
      email: existing.email,
      full_name: input.fullName ?? existing.fullName,
      is_owner: isOwnerEmail(existing.email),
      account_type: account.type,
      account_id: account.id,
    };
  }

  const inserted = (await drizzle
    .insert(schema.users)
    .values({
      email: normalized,
      fullName: input.fullName,
      avatarUrl: input.avatarUrl ?? null,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
    })
    .returning()) as Array<{ id: string; email: string; fullName: string | null }>;

  const created = inserted[0];
  const { startTrialForUser } = await import("./trial-gate");
  await startTrialForUser(created.id);

  const account = await ensureDefaultAccount(created.id);
  log.info("clerk bridge: created wireline user + account", {
    email: normalized,
    accountId: account.id,
    accountType: account.type,
  });

  return {
    id: created.id,
    email: created.email,
    full_name: created.fullName,
    is_owner: isOwnerEmail(created.email),
    account_type: account.type,
    account_id: account.id,
  };
}
