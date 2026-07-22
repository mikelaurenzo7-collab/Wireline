import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, ne } from "drizzle-orm";
import { assertFederalDncForMarketing, isFederalDncListed } from "./federal-dnc-service";
import { isDncBlocked } from "./compliance";
import { evaluateOutboundConsent, type ConsentDecision } from "./tcpa-consent";
import { LEAD_STATUS } from "./outbound-status";
import { jsonSafeId } from "./server-utils";

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
      federalDncCode?: string;
      federalDncMessage?: string;
      tcpaDecision?: ConsentDecision;
    };

/**
 * Shared compliance gate for campaign dials, intake auto-dial, and manual
 * Studio/mobile outbound. Marketing paths require federal DNC + express
 * written consent; non-marketing Studio dials still run tenant DNC + TCPA
 * + the 24h duplicate window.
 */
export async function evaluateOutboundDialGate(opts: {
  userId: string;
  phone: string;
  /** Outbound lead primary key (bigint column). */
  leadId?: bigint | number | string;
  lastCalledAt?: Date | null;
  metadata?: Record<string, unknown>;
  /**
   * Marketing/campaign/intake default to true. Manual Studio dials pass the
   * call-purpose marketing flag so non-marketing dials skip the federal
   * vendor requirement while still enforcing tenant DNC + TCPA + duplicates.
   */
  isMarketingCall?: boolean;
  /** Explicit consent override; falls back to metadata.has_express_written_consent. */
  hasExpressWrittenConsent?: boolean;
}): Promise<OutboundDialGateResult> {
  const isMarketingCall = opts.isMarketingCall !== false;
  const metadata = opts.metadata || {};
  const hasExpressWrittenConsent =
    opts.hasExpressWrittenConsent === true || metadata.has_express_written_consent === true;

  if (isMarketingCall) {
    const federalGate = assertFederalDncForMarketing();
    if (!federalGate.allowed) {
      return {
        allowed: false,
        status: "AutoDialFailed",
        reason: "federal_dnc_unconfigured",
        federalDncCode: federalGate.code,
        federalDncMessage: federalGate.message,
        metadataPatch: {
          ...metadata,
          auto_dial_error: federalGate.message,
          federal_dnc_code: federalGate.code,
        },
      };
    }
  }

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
  if (opts.leadId != null && opts.leadId !== "") {
    otherConditions.push(ne(schema.outboundLeads.id, BigInt(opts.leadId)));
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
        // jsonb cannot store raw JS BigInt — always stringify lead IDs
        duplicate_of_lead_id: jsonSafeId(otherRecent.id),
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
    is_marketing_call: isMarketingCall,
    has_express_written_consent: hasExpressWrittenConsent,
  });

  if (!tcpaDecision.allowed) {
    return {
      allowed: false,
      status: LEAD_STATUS.BLOCKED_TCPA,
      reason: "blocked_tcpa",
      tcpaDecision,
      metadataPatch: { ...metadata, tcpa: tcpaDecision },
      consentLogEvent: "outbound_blocked_tcpa",
    };
  }

  return { allowed: true, tcpaDecision };
}
