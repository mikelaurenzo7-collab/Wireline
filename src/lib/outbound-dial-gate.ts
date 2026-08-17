import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, ne } from "drizzle-orm";
import { assertFederalDncForMarketing, isFederalDncListed } from "./federal-dnc-service";
import { isDncBlocked } from "./compliance";
import { isPlatformOwnerUserId } from "./platform-owner-user";
import { evaluateOutboundConsent, type ConsentDecision } from "./tcpa-consent";
import { resolveCallingHoursForPhone } from "./tcpa-calling-hours";
import { LEAD_STATUS } from "./outbound-status";
import { jsonSafeId } from "./server-utils";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OutboundDialDenyReason =
  | "federal_dnc_unconfigured"
  | "blocked_internal_dnc"
  | "blocked_tcpa"
  | "outside_permitted_calling_hours"
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
  /**
   * Caller-requested callbacks are a distinct TCPA class: the consumer asked,
   * on a recorded line, to be called back — prior express consent for that
   * specific return call. This flag (a) treats the dial as non-marketing,
   * (b) supplies that consent, and (c) skips the 24h duplicate guard, because
   * a callback within a day of the original call is the entire point.
   * Quiet hours and tenant/federal DNC lookups still apply — a caller who
   * lands on DNC after requesting a callback stays protected.
   */
  isRequestedCallback?: boolean;
  /**
   * In-session follow-up (e.g. SMS during a live call the consumer is on).
   * Keeps tenant + federal DNC; skips quiet hours and the 24h duplicate
   * window because the consumer is already engaged on the line.
   */
  isLiveSessionFollowUp?: boolean;
}): Promise<OutboundDialGateResult> {
  const isLiveSessionFollowUp = opts.isLiveSessionFollowUp === true;
  const isRequestedCallback = opts.isRequestedCallback === true || isLiveSessionFollowUp;
  const isMarketingCall = isRequestedCallback ? false : opts.isMarketingCall !== false;
  const metadata = opts.metadata || {};
  const hasExpressWrittenConsent =
    opts.hasExpressWrittenConsent === true ||
    metadata.has_express_written_consent === true ||
    isRequestedCallback;

  // TCPA quiet hours first — local computation, cheapest fail-closed check.
  // Live-session follow-up skips this: the consumer is already on the line.
  if (!isLiveSessionFollowUp) {
    const callingHours = resolveCallingHoursForPhone(opts.phone);
    if (!callingHours.allowed) {
      return {
        allowed: false,
        status: "AutoDialFailed",
        reason: "outside_permitted_calling_hours",
        metadataPatch: {
          ...metadata,
          auto_dial_error: "Outside TCPA permitted calling hours (8am to 9pm local).",
          calling_hours: callingHours,
        },
      };
    }
  }

  if (isMarketingCall) {
    const federalGate = assertFederalDncForMarketing({
      isPlatformOwner: await isPlatformOwnerUserId(opts.userId),
    });
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

  if (opts.lastCalledAt && !isRequestedCallback) {
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

  if (!isRequestedCallback) {
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

  // Requested callbacks are treated as non-marketing (is_marketing_call=false)
  // to waive the express-written-consent requirement — but evaluateOutboundConsent
  // ALSO skips its federal-DNC block for non-marketing calls, which would let a
  // federally-listed number be dialed on the callback path. The platform stays
  // fail-closed on the federal registry, so enforce it explicitly here (also
  // fires when the lookup errored, since isFederalDncListed returns listed on
  // failure). Quiet hours + tenant DNC already ran above.
  if (isRequestedCallback && isFederalDnc) {
    return {
      allowed: false,
      status: LEAD_STATUS.BLOCKED_TCPA,
      reason: "blocked_tcpa",
      metadataPatch: { ...metadata, federal_dnc_blocked: true },
      consentLogEvent: "outbound_blocked_tcpa",
    };
  }

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
