/**
 * Storage for each seller's own National Do Not Call Registry subscription.
 * Rules live in ./dnc-seller-registration-rules so the browser shares them.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { drizzle, log, tenantStore } from "./server-context";
import {
  readDncSellerSetup,
  readStoredDncSellerRegistration,
  dncRenewalCheckAt,
  dncSellerRegistrationState,
  dncSellerSetupState,
  type DncSellerRegistration,
  type DncSellerRegistrationState,
  type DncSellerSetup,
  type DncSellerVerification,
} from "./dnc-seller-registration-rules";

async function readRegistrationValue(userId: string): Promise<unknown> {
  const [row] = await drizzle
    .select({ registration: schema.settings.dncSellerRegistration })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return row?.registration ?? null;
}

export async function getDncSellerSetup(userId: string): Promise<DncSellerSetup> {
  return readDncSellerSetup(await readRegistrationValue(userId));
}

function unchangedRegistration(userId: string, rawRegistration: unknown) {
  return and(
    eq(schema.settings.userId, userId),
    sql`coalesce(${schema.settings.dncSellerRegistration}, 'null'::jsonb) = ${JSON.stringify(rawRegistration)}::jsonb`,
  );
}

export async function saveDncSellerVerification(
  userId: string,
  value: Pick<DncSellerVerification, "ftc_org_id" | "san">,
): Promise<DncSellerSetup> {
  const [row] = await drizzle
    .select({
      registration: schema.settings.dncSellerRegistration,
      businessName: schema.settings.businessName,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  const raw = row?.registration ?? null;
  const { registration, verification } = readDncSellerSetup(raw);
  if (
    verification?.state === "pending" &&
    verification.ftc_org_id === value.ftc_org_id &&
    verification.san === value.san
  )
    return { registration, verification };

  const now = new Date();
  // Keep the current verified term usable while its replacement is staged.
  const current =
    registration?.ftc_org_id === value.ftc_org_id &&
    registration.san !== value.san &&
    dncSellerRegistrationState(registration, now) === "active"
      ? registration
      : null;
  const request: DncSellerVerification = {
    ...value,
    seller_name: row?.businessName?.trim().slice(0, 200) || "BotBound workspace",
    attested_by: userId,
    attested_at: now.toISOString(),
    state: "pending",
    project_code: null,
    first_check_at: null,
    next_check_at: current ? dncRenewalCheckAt(current.expires_on, now) : now.toISOString(),
  };
  const updated = await drizzle
    .update(schema.settings)
    .set({ dncSellerRegistration: { ...current, verification: request }, updatedAt: now })
    .where(unchangedRegistration(userId, raw))
    .returning({ userId: schema.settings.userId });
  if (!updated.length)
    throw AppError.fromHttpStatus(
      409,
      "Reload Compliance to check your subscription, then try again.",
    );
  return { registration: current, verification: request };
}

/** Save the owner's subscription. Changed subscription details require re-linking. */
export async function saveDncSellerRegistration(input: {
  userId: string;
  value: Pick<DncSellerRegistration, "san" | "seller_name" | "area_codes" | "expires_on">;
}): Promise<DncSellerRegistration> {
  const rawRegistration = await readRegistrationValue(input.userId);
  const { registration: existing, verification } = readDncSellerSetup(rawRegistration);
  if (existing?.ftc_org_id || verification)
    throw AppError.fromHttpStatus(
      409,
      "Use your FTC Organization ID and SAN to update this subscription.",
    );
  const keepLink =
    existing?.san === input.value.san &&
    existing.seller_name === input.value.seller_name &&
    existing.expires_on === input.value.expires_on &&
    JSON.stringify(existing.area_codes) === JSON.stringify(input.value.area_codes);
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
    .where(unchangedRegistration(input.userId, rawRegistration))
    .returning({ userId: schema.settings.userId });
  if (!updated.length)
    throw AppError.fromHttpStatus(
      409,
      "Reload Compliance to check the current registration, then try again.",
    );
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
    const rawRegistration = await readRegistrationValue(input.userId);
    const existing = readStoredDncSellerRegistration(rawRegistration);
    if (!existing) throw AppError.fromHttpStatus(404, "This account has no DNC registration.");
    if (existing.ftc_org_id)
      throw AppError.fromHttpStatus(409, "This subscription uses automatic vendor verification.");
    // The admin configured the vendor project for a specific SAN; refuse if it changed since.
    if (existing.san !== input.expectedSan)
      throw AppError.fromHttpStatus(409, "The account's SAN changed. Check the vendor project.");
    const registration: DncSellerRegistration = {
      ...existing,
      vendor_project_id: input.vendorProjectId,
      vendor_linked_at: new Date().toISOString(),
    };
    const updated = await drizzle
      .update(schema.settings)
      .set({ dncSellerRegistration: registration, updatedAt: new Date() })
      .where(unchangedRegistration(input.userId, rawRegistration))
      .returning({ userId: schema.settings.userId });
    if (!updated.length)
      throw AppError.fromHttpStatus(
        409,
        "The registration changed. Confirm the vendor project against the current subscription.",
      );
    return registration;
  });
}

export type DncSellerRegistrationSummary = {
  user_id: string;
  seller_name: string;
  san: string | null;
  state: DncSellerRegistrationState;
  expires_on: string | null;
  vendor_project_id: string | null;
  vendor_campaign_id: number | null;
  verification_state: DncSellerVerification["state"] | null;
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
    const setup = readDncSellerSetup(row.registration);
    const { registration, verification } = setup;
    const seller = registration ?? verification;
    if (!row.userId || !seller) continue;
    summaries.push({
      user_id: row.userId,
      seller_name: seller.seller_name,
      san: registration && !registration.ftc_org_id ? registration.san : null,
      state: dncSellerSetupState(setup),
      expires_on: registration?.expires_on ?? null,
      vendor_project_id: registration?.vendor_project_id ?? verification?.project_code ?? null,
      vendor_campaign_id: registration?.vendor_campaign_id ?? null,
      verification_state: verification?.state ?? null,
    });
  }
  return summaries;
}
