/* eslint-disable @typescript-eslint/no-explicit-any -- Drizzle transaction types are structurally compatible but not exported as a stable public alias. */
import { desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  buildCompanyIdentityProfile,
  companyIdentityFingerprint,
  defaultCompanyIdentityPreferences,
  readCompanyIdentityPreferences,
} from "./company-identity";
import { drizzle, serialQueryBatch } from "./server-context";

type PreferenceEnvelope = Record<string, unknown>;

function preferenceEnvelope(value: unknown): PreferenceEnvelope {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as PreferenceEnvelope) }
    : {};
}

export async function acquireCompanyIdentityMutationLock(tx: any, userId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('company-identity'), hashtext(${userId}))`,
  );
  await tx.execute(sql`SELECT id FROM wireline_settings WHERE user_id = ${userId} FOR UPDATE`);
  await tx.execute(
    sql`SELECT user_id FROM wireline_user_preferences WHERE user_id = ${userId} FOR UPDATE`,
  );
}

/**
 * Reconcile review state after a committed-in-this-transaction branding or
 * phone-number mutation. The caller must already hold the tenant identity lock.
 */
export async function reconcileCompanyIdentityAfterMutation(
  tx: any,
  userId: string,
  reason: "branding_changed" | "phone_number_changed",
): Promise<boolean> {
  // Serialized: this always runs on a transaction handle passed in by
  // runCompanyIdentityMutation.
  const [[settingsRow], [preferencesRow], [phoneRow]] = await serialQueryBatch([
    tx
      .select({
        businessName: schema.settings.businessName,
        brandName: schema.settings.brandName,
        brandLogoUrl: schema.settings.brandLogoUrl,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
    tx
      .select({ preferences: schema.userPreferences.preferences })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1),
    tx
      .select({ id: schema.phoneNumbers.id, phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, userId))
      .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
      .limit(1),
  ]);

  const envelope = preferenceEnvelope(preferencesRow?.preferences);
  const preferences = readCompanyIdentityPreferences(envelope.company_identity);
  const hasReviewState =
    Boolean(preferences.reviewRequestedAt) ||
    Object.values(preferences.providerStatus).some((status) => status !== "not_requested");
  if (!hasReviewState) return false;

  const profile = buildCompanyIdentityProfile({ settings: settingsRow, preferences });
  const currentFingerprint = companyIdentityFingerprint({
    ...profile,
    phoneNumber: phoneRow?.phoneNumber ?? null,
  });
  if (preferences.reviewFingerprint === currentFingerprint) return false;

  const nextPreferences = {
    ...preferences,
    reviewRequestedAt: null,
    reviewFingerprint: null,
    providerStatus: defaultCompanyIdentityPreferences().providerStatus,
  };
  const nextEnvelope = {
    ...envelope,
    company_identity: nextPreferences,
  };

  await tx
    .insert(schema.userPreferences)
    .values({ userId, preferences: nextEnvelope, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.userPreferences.userId,
      set: { preferences: nextEnvelope, updatedAt: new Date() },
    });
  await tx.insert(schema.auditLog).values({
    userId,
    action: "company_identity.review_invalidated",
    eventType: "company_identity.review_invalidated",
    severity: "info",
    resourceType: "company_identity",
    metadata: {
      reason,
      profileFingerprintSha256: currentFingerprint,
    },
  });
  return true;
}

export async function runCompanyIdentityMutation<T>(
  userId: string,
  reason: "branding_changed" | "phone_number_changed",
  mutation: (tx: any) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await acquireCompanyIdentityMutationLock(tx, userId);
    const result = await mutation(tx);
    await reconcileCompanyIdentityAfterMutation(tx, userId, reason);
    return result;
  });
}
