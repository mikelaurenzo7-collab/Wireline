 
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, ne } from "drizzle-orm";
import { assertFederalDncForMarketing, isFederalDncListed } from "./federal-dnc-service";
import { isDncBlocked } from "./compliance";
import { evaluateOutboundConsent, type ConsentDecision } from "./tcpa-consent";
import { LEAD_STATUS } from "./outbound-status";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OutboundDialDenyReason =
  | "federal_dnc_unconfigured"
  | "blocked_internal_dnc"
  | "blocked_tcpa"
  | "skipped_duplicate"
  | "self_recent_call_scheduled";

export type OutboundDialGateResult =
  | { allowed: true; tcpaDecision: ConsentDecision }
  | {
      allowed: false;
      status: string;
      reason: OutboundDialDenyReason;
      metadataPatch?: Record<string, unknown>;
      consentLogEvent?: string;
    };

/**
 * Shared compliance gate for campaign dials and intake auto-dial.
 * Marketing outbound only — requires express written consent attestation.
 */
export async function evaluateOutboundDialGate(opts: {
  userId: string;
  phone: string;
  leadId?: string;
  lastCalledAt?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<OutboundDialGateResult> {
  const federalGate = assertFederalDncForMarketing();
  if (!federalGate.allowed) {
    return {
      allowed: false,
      status: "AutoDialFailed",
      reason: "federal_dnc_unconfigured",
      metadataPatch: {
        ...(opts.metadata || {}),
        auto_dial_error: federalGate.message,
        federal_dnc_code: federalGate.code,
      },
    };
  }

  const metadata = opts.metadata || {};

  if (opts.lastCalledAt) {
    const elapsed = Date.now() - opts.lastCalledAt.getTime();
    if (elapsed < DUPLICATE_WINDOW_MS) {
      const nextEligible = new Date(opts.lastCalledAt.getTime() + DUPLICATE_WINDOW_MS);
      return {
        allowed: false,
        status: LEAD_STATUS.CALLBACK_SCHEDULED,
        reason: "self_recent_call_scheduled",
        metadataPatch: {
          ...metadata,
          next_eligible_at: nextEligible.toISOString(),
          duplicate_guard: "self_within_24h",
        },
      };
    }
  }

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const otherConditions = [
    eq(schema.outboundLeads.userId, opts.userId),
    eq(schema.outboundLeads.customerNumber, opts.phone),
    gte(schema.outboundLeads.lastCalledAt, since),
  ];
  if (opts.leadId) {
    otherConditions.push(ne(schema.outboundLeads.id, opts.leadId));
  }

  const [otherRecent] = await drizzle
    .select({ id: schema.outboundLeads.id })
    .from(schema.outboundLeads)
    .where(and(...otherConditions))
    .limit(1);

  if (otherRecent) {
    return {
      allowed: false,
      status: LEAD_STATUS.SKIPPED_DUPLICATE,
      reason: "skipped_duplicate",
      metadataPatch: {
        ...metadata,
        duplicate_of_lead_id: otherRecent.id,
        duplicate_guard: "other_within_24h",
      },
    };
  }

  if (await isDncBlocked(opts.userId, opts.phone)) {
    return {
      allowed: false,
      status: LEAD_STATUS.BLOCKED_DNC,
      reason: "blocked_internal_dnc",
      consentLogEvent: "outbound_blocked_dnc",
    };
  }

  const isFederalDnc = await isFederalDncListed(opts.phone);
  const tcpaDecision = evaluateOutboundConsent({
    phone: opts.phone,
    is_internal_dnc: false,
    is_federal_dnc: isFederalDnc,
    is_marketing_call: true,
    has_express_written_consent: metadata.has_express_written_consent === true,
  });

  if (!tcpaDecision.allowed) {
    return {
      allowed: false,
      status: LEAD_STATUS.BLOCKED_TCPA,
      reason: "blocked_tcpa",
      metadataPatch: { ...metadata, tcpa: tcpaDecision },
      consentLogEvent: "outbound_blocked_tcpa",
    };
  }

  return { allowed: true, tcpaDecision };
}
