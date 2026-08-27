import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, ne } from "drizzle-orm";
import { assertFederalDncForMarketing, isFederalDncListed } from "./federal-dnc-service";
import { isDncBlocked } from "./compliance";
import { evaluateOutboundConsent, type ConsentDecision } from "./tcpa-consent";
import { resolveCallingHoursForPhone } from "./tcpa-calling-hours";
import { LEAD_STATUS } from "./outbound-status";
import { jsonSafeId } from "./server-utils";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Merge gate diagnostics onto the current lead document without replacing it. */
export function mergeLeadMetadata(
  current: Record<string, unknown>,
  patch?: Record<string, unknown> | null,
): Record<string, unknown> {
  return patch ? { ...current, ...patch } : current;
}

export type OutboundDialDenyReason =
  /** Canonical fail-closed result when marketing screening cannot run. */
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
      /** Legacy fields retained for backwards-compatible response narrowing. */
      federalDncCode?: string;
      federalDncMessage?: string;
      tcpaDecision?: ConsentDecision;
    };

/**
 * Shared compliance gate for campaign dials, intake auto-dial, and manual
 * Studio/mobile outbound. Marketing fails closed when Federal DNC credentials
 * are unavailable. Non-marketing service calls remain available and every path
 * still enforces its applicable tenant DNC, consent, calling-hours, duplicate,
 * and configured Federal DNC controls.
 */
export async function evaluateOutboundDialGate(opts: {
  userId: string;
  phone: string;
  /** Outbound lead primary key (bigint column). */
  leadId?: bigint | number | string;
  lastCalledAt?: Date | null;
  metadata?: Record<string, unknown>;
  /** Marketing/campaign/intake default to true; direct service calls pass false. */
  isMarketingCall?: boolean;
  /**
   * Require a configured Federal DNC provider and block listed numbers even
   * when an untrusted direct-dial client labels the call non-marketing.
   */
  requireFederalDncScreening?: boolean;
  /** Explicit consent override; falls back to metadata.has_express_written_consent. */
  hasExpressWrittenConsent?: boolean;
  /**
   * Caller-requested callbacks are a distinct TCPA class: the consumer asked,
   * on a recorded line, to be called back. The return call is non-marketing,
   * supplies that consent, and skips the 24-hour duplicate guard. Calling hours,
   * tenant DNC, and configured Federal DNC screening still apply.
   */
  isRequestedCallback?: boolean;
  /**
   * In-session follow-up, such as SMS during a live call. Tenant and configured
   * Federal DNC checks remain; quiet hours and duplicate suppression are skipped.
   */
  isLiveSessionFollowUp?: boolean;
}): Promise<OutboundDialGateResult> {
  const isLiveSessionFollowUp = opts.isLiveSessionFollowUp === true;
  const isRequestedCallback = opts.isRequestedCallback === true || isLiveSessionFollowUp;
  const isMarketingCall = isRequestedCallback ? false : opts.isMarketingCall !== false;
  const requiresFederalDncScreening = isMarketingCall || opts.requireFederalDncScreening === true;
  const metadata = opts.metadata || {};
  const hasExpressWrittenConsent =
    opts.hasExpressWrittenConsent === true ||
    metadata.has_express_written_consent === true ||
    isRequestedCallback;

  if (requiresFederalDncScreening) {
    const federalGate = assertFederalDncForMarketing();
    if (!federalGate.allowed) {
      return {
        allowed: false,
        status: "AutoDialFailed",
        reason: "federal_dnc_unconfigured",
        metadataPatch: { federal_dnc_configured: false },
        federalDncCode: federalGate.code,
        federalDncMessage: federalGate.message,
      };
    }
  }

  // TCPA quiet hours first: local computation and the cheapest fail-closed check.
  // Live-session follow-up skips this because the consumer is already engaged.
  if (!isLiveSessionFollowUp) {
    const callingHours = resolveCallingHoursForPhone(opts.phone);
    if (!callingHours.allowed) {
      return {
        allowed: false,
        status: "AutoDialFailed",
        reason: "outside_permitted_calling_hours",
        metadataPatch: {
          auto_dial_error: "Outside TCPA permitted calling hours (8am to 9pm local).",
          calling_hours: callingHours,
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
          // jsonb cannot store raw JS BigInt: always stringify lead IDs.
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

  // Requested callbacks are non-marketing for express-consent purposes, but a
  // configured federal provider's listed/error result still blocks explicitly.
  if ((requiresFederalDncScreening || isRequestedCallback) && isFederalDnc) {
    return {
      allowed: false,
      status: LEAD_STATUS.BLOCKED_TCPA,
      reason: "blocked_tcpa",
      metadataPatch: { federal_dnc_blocked: true },
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
      metadataPatch: { tcpa: tcpaDecision },
      consentLogEvent: "outbound_blocked_tcpa",
    };
  }

  return { allowed: true, tcpaDecision };
}
