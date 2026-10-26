import * as schema from "../db/schema";
import type { DerivedRelationship } from "./outbound-relationship";
import { drizzle, log } from "./server-context";

export type OutboundAuditDecision = {
  userId: string;
  channel: "call" | "sms";
  destinationE164: string;
  requestedPurpose: string;
  effectivePurpose: string;
  derivedRelationship?: DerivedRelationship | null;
  attested?: boolean;
  attestationTextVersion?: string | null;
  confirmations?: Record<string, unknown> | null;
  customerSince?: Date | null;
  dncChecked: boolean;
  dncSource: "vendor" | "ftc_file" | "none";
  dncResult?: string | null;
  dncListVersion?: string | null;
  quietHoursTz?: string | null;
  decision: "allowed" | "blocked";
  blockCode?: string | null;
  actorIp?: string | null;
  userAgent?: string | null;
  salesAttestationUserId?: string | null;
  salesAttestationAt?: Date | null;
  salesAttestationVersion?: string | null;
};

/**
 * Append-only purpose audit. A missing table or a transient write failure is
 * logged and does not hide the gate decision. The row never stores provider
 * secrets or registry credentials.
 */
export async function recordOutboundPurposeAudit(entry: OutboundAuditDecision): Promise<void> {
  const insert = (drizzle as { insert?: typeof drizzle.insert }).insert;
  if (typeof insert !== "function") return;
  try {
    await drizzle.insert(schema.outboundPurposeAudit).values({
      userId: entry.userId,
      channel: entry.channel,
      destinationE164: entry.destinationE164,
      requestedPurpose: entry.requestedPurpose,
      effectivePurpose: entry.effectivePurpose,
      derivedRelationship: entry.derivedRelationship ?? null,
      attested: entry.attested === true,
      attestationTextVersion: entry.attestationTextVersion ?? null,
      confirmations: entry.confirmations ?? null,
      customerSince: entry.customerSince ?? null,
      dncChecked: entry.dncChecked,
      dncSource: entry.dncSource,
      dncResult: entry.dncResult ?? null,
      dncListVersion: entry.dncListVersion ?? null,
      quietHoursTz: entry.quietHoursTz ?? null,
      decision: entry.decision,
      blockCode: entry.blockCode ?? null,
      actorIp: entry.actorIp ?? null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      salesAttestationUserId: entry.salesAttestationUserId ?? null,
      salesAttestationAt: entry.salesAttestationAt ?? null,
      salesAttestationVersion: entry.salesAttestationVersion ?? null,
    });
  } catch (error) {
    log.warn("outbound purpose audit was not saved", {
      userId: entry.userId,
      channel: entry.channel,
      decision: entry.decision,
      blockCode: entry.blockCode ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
