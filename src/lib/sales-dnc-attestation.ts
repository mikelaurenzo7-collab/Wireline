/**
 * One-time workspace attestation for one-off sales calls and texts.
 * The wording version is server-owned. A newer version asks again.
 */
import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import {
  SALES_DNC_ATTESTATION_VERSION,
} from "./outbound-compliance-copy";
import { drizzle } from "./server-context";

export type SalesDncAttestation = {
  userId: string;
  at: Date;
  version: string;
};

export function currentSalesDncAttestation(row: {
  salesDncAttestationUserId?: string | null;
  salesDncAttestationAt?: Date | string | null;
  salesDncAttestationVersion?: string | null;
} | null | undefined): SalesDncAttestation | null {
  if (!row) return null;
  if (row.salesDncAttestationVersion !== SALES_DNC_ATTESTATION_VERSION) return null;
  if (!row.salesDncAttestationUserId) return null;
  const at =
    row.salesDncAttestationAt instanceof Date
      ? row.salesDncAttestationAt
      : typeof row.salesDncAttestationAt === "string"
        ? new Date(row.salesDncAttestationAt)
        : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return {
    userId: row.salesDncAttestationUserId,
    at,
    version: row.salesDncAttestationVersion,
  };
}

export async function readSalesDncAttestation(userId: string): Promise<SalesDncAttestation | null> {
  const [row] = await drizzle
    .select({
      salesDncAttestationUserId: schema.settings.salesDncAttestationUserId,
      salesDncAttestationAt: schema.settings.salesDncAttestationAt,
      salesDncAttestationVersion: schema.settings.salesDncAttestationVersion,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return currentSalesDncAttestation(row);
}

/** Remember the checkbox. A matching version keeps the original who and when. */
export async function recordSalesDncAttestation(input: {
  workspaceUserId: string;
  actorUserId: string;
}): Promise<SalesDncAttestation> {
  const existing = await readSalesDncAttestation(input.workspaceUserId);
  if (existing) return existing;
  const at = new Date();
  const updated = await drizzle
    .update(schema.settings)
    .set({
      salesDncAttestationUserId: input.actorUserId,
      salesDncAttestationAt: at,
      salesDncAttestationVersion: SALES_DNC_ATTESTATION_VERSION,
      updatedAt: new Date(),
    })
    .where(eq(schema.settings.userId, input.workspaceUserId))
    .returning({ userId: schema.settings.userId });
  if (!updated.length) throw AppError.fromHttpStatus(409, "Account settings are not ready yet.");
  return {
    userId: input.actorUserId,
    at,
    version: SALES_DNC_ATTESTATION_VERSION,
  };
}
