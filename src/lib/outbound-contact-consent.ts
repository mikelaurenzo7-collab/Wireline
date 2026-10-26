import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  canonicalizeOutboundPurpose,
  type OutboundCallPurpose,
  type OutboundPurpose,
} from "./outbound-call-purpose";
import {
  CONTACT_PERMISSION_VERSION,
  NONSALES_CONFIRMATION_VERSION,
} from "./outbound-compliance-copy";
import { drizzle } from "./server-context";

export type ContactOutboundRecord = {
  permissionConfirmed: boolean;
  nonsalesConfirmed: boolean;
  lastPurpose: OutboundPurpose | null;
  customerSince: string | null;
};

function emptyRecord(): ContactOutboundRecord {
  return {
    permissionConfirmed: false,
    nonsalesConfirmed: false,
    lastPurpose: null,
    customerSince: null,
  };
}

export function normalizeContactPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(phone)) return phone;
  return null;
}

export async function readContactOutboundRecord(
  userId: string,
  phone: string,
): Promise<ContactOutboundRecord> {
  const phoneE164 = normalizeContactPhone(phone);
  if (!phoneE164) return emptyRecord();
  const [row] = await drizzle
    .select({
      permissionConfirmedAt: schema.contactOutboundConsent.permissionConfirmedAt,
      nonsalesConfirmedAt: schema.contactOutboundConsent.nonsalesConfirmedAt,
      lastPurpose: schema.contactOutboundConsent.lastPurpose,
      customerSince: schema.contactOutboundConsent.customerSince,
    })
    .from(schema.contactOutboundConsent)
    .where(
      and(
        eq(schema.contactOutboundConsent.userId, userId),
        eq(schema.contactOutboundConsent.phoneE164, phoneE164),
      ),
    )
    .limit(1);
  if (!row) return emptyRecord();
  const last = row.lastPurpose;
  return {
    permissionConfirmed: row.permissionConfirmedAt instanceof Date,
    nonsalesConfirmed: row.nonsalesConfirmedAt instanceof Date,
    lastPurpose:
      typeof last === "string" &&
      (["personal", "returning_contact", "appointment_service", "existing_customer", "sales", "callback"] as const).includes(
        last as OutboundPurpose,
      )
        ? (last as OutboundPurpose)
        : last === "service_or_requested"
          ? "appointment_service"
          : last === "marketing_or_sales"
            ? "sales"
            : null,
    customerSince: row.customerSince instanceof Date ? row.customerSince.toISOString() : null,
  };
}

export async function rememberContactOutbound(input: {
  userId: string;
  phone: string;
  purpose?: OutboundCallPurpose;
  permissionConfirmed?: boolean;
  nonsalesConfirmed?: boolean;
  customerSince?: Date | null;
}): Promise<void> {
  const phoneE164 = normalizeContactPhone(input.phone);
  if (!phoneE164) return;
  const now = new Date();
  const purpose = input.purpose ? canonicalizeOutboundPurpose(input.purpose) : null;
  await drizzle
    .insert(schema.contactOutboundConsent)
    .values({
      userId: input.userId,
      phoneE164,
      permissionConfirmedAt: input.permissionConfirmed ? now : null,
      permissionTextVersion: input.permissionConfirmed ? CONTACT_PERMISSION_VERSION : null,
      nonsalesConfirmedAt: input.nonsalesConfirmed ? now : null,
      nonsalesTextVersion: input.nonsalesConfirmed ? NONSALES_CONFIRMATION_VERSION : null,
      lastPurpose: purpose,
      customerSince: input.customerSince ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.contactOutboundConsent.userId, schema.contactOutboundConsent.phoneE164],
      set: {
        ...(input.permissionConfirmed
          ? {
              permissionConfirmedAt: now,
              permissionTextVersion: CONTACT_PERMISSION_VERSION,
            }
          : {}),
        ...(input.nonsalesConfirmed
          ? {
              nonsalesConfirmedAt: now,
              nonsalesTextVersion: NONSALES_CONFIRMATION_VERSION,
            }
          : {}),
        ...(purpose ? { lastPurpose: purpose } : {}),
        ...(input.customerSince ? { customerSince: input.customerSince } : {}),
        updatedAt: now,
      },
    });
}
