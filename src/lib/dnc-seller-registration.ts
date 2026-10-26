/**
 * Storage for each seller's own National Do Not Call Registry subscription.
 * Rules live in ./dnc-seller-registration-rules so the browser shares them.
 */
import { eq, isNotNull } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { drizzle, log, tenantStore } from "./server-context";
import {
  evaluateDncSellerRegistration,
  readStoredDncSellerRegistration,
  dncSellerRegistrationState,
  type DncSellerGateResult,
  type DncSellerRegistration,
  type DncSellerRegistrationState,
} from "./dnc-seller-registration-rules";

export async function readDncSellerRegistration(
  userId: string,
): Promise<DncSellerRegistration | null> {
  const [row] = await drizzle
    .select({ registration: schema.settings.dncSellerRegistration })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return readStoredDncSellerRegistration(row?.registration);
}

/** Marketing gate: a missing, unlinked, expired or non-covering registration fails closed. */
export async function evaluateSellerDncForMarketing(
  userId: string,
  phone: string,
): Promise<DncSellerGateResult> {
  return evaluateDncSellerRegistration(await readDncSellerRegistration(userId), phone);
}

/**
 * Save the owner's subscription. A changed SAN clears the vendor link, because
 * the vendor project is configured with the previous SAN.
 */
export async function saveDncSellerRegistration(input: {
  userId: string;
  value: Pick<DncSellerRegistration, "san" | "seller_name" | "area_codes" | "expires_on">;
}): Promise<DncSellerRegistration> {
  const existing = await readDncSellerRegistration(input.userId);
  const keepLink = existing?.san === input.value.san;
  const registration: DncSellerRegistration = {
    ...input.value,
    attested_at: new Date().toISOString(),
    attested_by: input.userId,
    vendor_project_id: keepLink ? existing.vendor_project_id : null,
    vendor_linked_at: keepLink ? existing.vendor_linked_at : null,
  };
  const updated = await drizzle
    .update(schema.settings)
    .set({ dncSellerRegistration: registration, updatedAt: new Date() })
    .where(eq(schema.settings.userId, input.userId))
    .returning({ userId: schema.settings.userId });
  if (!updated.length) throw AppError.fromHttpStatus(409, "Account settings are not ready yet.");
  if (!registration.vendor_project_id)
    log.info("DNC seller registration awaiting vendor link", { userId: input.userId });
  return registration;
}

export async function clearDncSellerRegistration(userId: string): Promise<void> {
  await drizzle
    .update(schema.settings)
    .set({ dncSellerRegistration: null, updatedAt: new Date() })
    .where(eq(schema.settings.userId, userId));
}

export async function readWorkspaceDncSan(userId: string): Promise<string | null> {
  const [row] = await drizzle
    .select({ dncSan: schema.settings.dncSan })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return typeof row?.dncSan === "string" && row.dncSan.trim() ? row.dncSan : null;
}

export async function saveWorkspaceDncSan(userId: string, san: string | null): Promise<void> {
  const updated = await drizzle
    .update(schema.settings)
    .set({ dncSan: san, updatedAt: new Date() })
    .where(eq(schema.settings.userId, userId))
    .returning({ userId: schema.settings.userId });
  if (!updated.length) throw AppError.fromHttpStatus(409, "Account settings are not ready yet.");
}

/** Platform admin: record the screening vendor project configured with this seller's SAN. */
export async function linkDncSellerVendorProject(input: {
  userId: string;
  expectedSan: string;
  vendorProjectId: string;
}): Promise<DncSellerRegistration> {
  return tenantStore.run(input.userId, async () => {
    const existing = await readDncSellerRegistration(input.userId);
    if (!existing) throw AppError.fromHttpStatus(404, "This account has no DNC registration.");
    // The admin configured the vendor project for a specific SAN; refuse if it changed since.
    if (existing.san !== input.expectedSan)
      throw AppError.fromHttpStatus(409, "The account's SAN changed. Check the vendor project.");
    const registration: DncSellerRegistration = {
      ...existing,
      vendor_project_id: input.vendorProjectId,
      vendor_linked_at: new Date().toISOString(),
    };
    await drizzle
      .update(schema.settings)
      .set({ dncSellerRegistration: registration, updatedAt: new Date() })
      .where(eq(schema.settings.userId, input.userId));
    return registration;
  });
}

export type DncSellerRegistrationSummary = {
  user_id: string;
  seller_name: string;
  san: string;
  state: DncSellerRegistrationState;
  expires_on: string;
  vendor_project_id: string | null;
};

/** Platform admin: every recorded registration, so pending links can be configured. */
export async function listDncSellerRegistrations(): Promise<DncSellerRegistrationSummary[]> {
  // Read across tenants with the server role; each row carries its owner id.
  const rows = await tenantStore.exit(
    async () =>
      await drizzle
        .select({
          userId: schema.settings.userId,
          registration: schema.settings.dncSellerRegistration,
        })
        .from(schema.settings)
        .where(isNotNull(schema.settings.dncSellerRegistration)),
  );
  const summaries: DncSellerRegistrationSummary[] = [];
  for (const row of rows) {
    const registration = readStoredDncSellerRegistration(row.registration);
    if (!row.userId || !registration) continue;
    summaries.push({
      user_id: row.userId,
      seller_name: registration.seller_name,
      san: registration.san,
      state: dncSellerRegistrationState(registration),
      expires_on: registration.expires_on,
      vendor_project_id: registration.vendor_project_id,
    });
  }
  return summaries;
}
