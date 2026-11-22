import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, gte, ne } from "drizzle-orm";
import { assertFederalDncForMarketing, lookupFederalDnc } from "./federal-dnc-service";
import { getDncProvider } from "./dnc-provider";
import {
  evaluateDncSellerRegistration,
  readStoredDncSellerRegistration,
} from "./dnc-seller-registration-rules";
import { isDncBlocked } from "./compliance";
import { evaluateOutboundConsent, type ConsentDecision } from "./tcpa-consent";
import { resolveCallingHoursForPhone } from "./tcpa-calling-hours";
import { LEAD_STATUS } from "./outbound-status";
import { jsonSafeId } from "./server-utils";
import {
  INTERNAL_DNC_MESSAGE,
  ONE_CALL_PER_DAY_MESSAGE,
  SALES_ATTESTATION_REQUIRED_MESSAGE,
  SALES_DNC_LISTED_MESSAGE,
  SALES_DNC_LOOKUP_FAILED_MESSAGE,
  quietHoursBlockedMessage,
} from "./outbound-compliance-copy";
import { recordOutboundPurposeAudit, type OutboundAuditDecision } from "./outbound-purpose-audit";
import type { DerivedRelationship } from "./outbound-relationship";
import { currentSalesDncAttestation } from "./sales-dnc-attestation";
import type { OutboundPurpose } from "./outbound-call-purpose";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SERVICE_PURPOSES: readonly OutboundPurpose[] = [
  "appointment_service",
  "existing_customer",
  "returning_contact",
  "callback",
];
const CARRIER_TERMINAL_STATES = ["completed", "busy", "no-answer", "failed", "canceled"];

function confirmedCarrierOutcome(lead: {
  callId: string | null;
  metadata: unknown;
}): string | null {
  if (!lead.callId || !lead.metadata || typeof lead.metadata !== "object") return null;
  const voice = (lead.metadata as { native_voice?: unknown }).native_voice;
  if (!voice || typeof voice !== "object") return null;
  const terminal = voice as { carrier_status?: unknown; twilio_call_sid?: unknown };
  return terminal.twilio_call_sid === lead.callId && typeof terminal.carrier_status === "string"
    ? terminal.carrier_status
    : null;
}

/** Merge gate diagnostics onto the current lead document without replacing it. */
export function mergeLeadMetadata(
  current: Record<string, unknown>,
  patch?: Record<string, unknown> | null,
): Record<string, unknown> {
  return patch ? { ...current, ...patch } : current;
}

export type OutboundDialDenyReason =
  /** Canonical fail-closed result when bulk sales screening cannot run. */
  | "federal_dnc_unconfigured"
  | "sales_attestation_required"
  | "blocked_internal_dnc"
  | "blocked_tcpa"
  | "outside_permitted_calling_hours"
  | "skipped_duplicate"
  | "self_recent_call_scheduled"
  | "contact_confirmation_required";

export type OutboundAuditInput = {
  channel?: "call" | "sms";
  requestedPurpose?: string;
  effectivePurpose?: string;
  derivedRelationship?: DerivedRelationship | null;
  attested?: boolean;
  attestationTextVersion?: string | null;
  confirmations?: Record<string, unknown> | null;
  customerSince?: Date | null;
  actorIp?: string | null;
  userAgent?: string | null;
  salesAttestationUserId?: string | null;
  salesAttestationAt?: Date | null;
  salesAttestationVersion?: string | null;
};

export type OutboundDialGateResult =
  | {
      allowed: true;
      tcpaDecision: ConsentDecision;
      customerMessage?: string;
      contentWarning?: string | null;
    }
  | {
      allowed: false;
      status: string;
      reason: OutboundDialDenyReason;
      metadataPatch?: Record<string, unknown>;
      consentLogEvent?: string;
      customerMessage?: string;
      /** Legacy fields retained for backwards-compatible response narrowing. */
      federalDncCode?: string;
      federalDncMessage?: string;
      tcpaDecision?: ConsentDecision;
    };

type WorkspaceSalesSettings = {
  dncSan: string | null;
  dncSellerRegistration: unknown;
  salesDncAttestationUserId: string | null;
  salesDncAttestationAt: Date | null;
  salesDncAttestationVersion: string | null;
};

async function loadWorkspaceSalesSettings(userId: string): Promise<WorkspaceSalesSettings | null> {
  const [settings] = await drizzle
    .select({
      dncSan: schema.settings.dncSan,
      dncSellerRegistration: schema.settings.dncSellerRegistration,
      salesDncAttestationUserId: schema.settings.salesDncAttestationUserId,
      salesDncAttestationAt: schema.settings.salesDncAttestationAt,
      salesDncAttestationVersion: schema.settings.salesDncAttestationVersion,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return settings ?? null;
}

/**
 * Shared compliance gate for campaign dials, intake auto-dial, callbacks, and
 * manual Studio outbound. Federal Do Not Call screening runs only for sales.
 * Every purpose still enforces quiet hours, the workspace opt-out list, and
 * the repeat-call window. Owner-initiated service calls can retry a confirmed
 * busy or unanswered number. A requested callback may follow a settled call.
 *
 * Bulk sales requires a provider and an active, linked seller subscription.
 * One-off sales requires the workspace attestation. If the provider is
 * configured and the seller has entered a subscription, that screen must
 * also pass using the linked project.
 */
export async function evaluateOutboundDialGate(opts: {
  userId: string;
  phone: string;
  /** Outbound lead primary key (bigint column). */
  leadId?: bigint | number | string;
  lastCalledAt?: Date | null;
  /** Lead context only. Stored metadata never establishes written consent. */
  metadata?: Record<string, unknown>;
  /** Sales defaults to true when omitted. Non-sales callers pass false. */
  isMarketingCall?: boolean;
  /**
   * Sales purpose. Bulk sales requires a configured provider and seller project.
   * One-off sales requires the workspace attestation.
   */
  requireFederalDncScreening?: boolean;
  /**
   * `bulk` is campaigns, imports, sequences, and automations.
   * `one_off` is the dial dialog, the SMS composer, and a Bot's individual send.
   * Omitted sales stays bulk so an untagged caller cannot skip screening.
   */
  salesScreening?: "one_off" | "bulk";
  /** Written consent independently verified by the server at this boundary. */
  hasExpressWrittenConsent?: boolean;
  /**
   * Caller-requested callbacks skip Federal DNC screening and the one-call-per-day
   * window. Quiet hours and the workspace opt-out list still apply.
   */
  isRequestedCallback?: boolean;
  /**
   * In-session follow-up, such as a text during a live call or within an hour
   * of an inbound text. Quiet hours and the one-call window are skipped.
   * Federal DNC still runs only when the effective purpose is sales.
   */
  isLiveSessionFollowUp?: boolean;
  /** Purpose confirmed by the owner in the atomic direct voice dial flow. */
  manualCallPurpose?: OutboundPurpose;
  audit?: OutboundAuditInput;
}): Promise<OutboundDialGateResult> {
  const isLiveSessionFollowUp = opts.isLiveSessionFollowUp === true;
  const isRequestedCallback = opts.isRequestedCallback === true || isLiveSessionFollowUp;
  const isMarketingCall = isRequestedCallback ? false : opts.isMarketingCall !== false;
  const requiresFederalDncScreening =
    !isRequestedCallback && (isMarketingCall || opts.requireFederalDncScreening === true);
  // Legacy imports could persist a client-supplied consent boolean. Every
  // execution path must reject that claim, including cadences and deferred
  // intake/callback jobs that read records created before input sanitization.
  const hasExpressWrittenConsent = opts.hasExpressWrittenConsent === true || isRequestedCallback;
  const requestedPurpose =
    opts.audit?.requestedPurpose ??
    (isRequestedCallback ? "callback" : isMarketingCall ? "sales" : "appointment_service");
  const effectivePurpose = opts.audit?.effectivePurpose ?? requestedPurpose;
  const auditBase: Omit<
    OutboundAuditDecision,
    | "dncChecked"
    | "dncSource"
    | "decision"
    | "blockCode"
    | "dncResult"
    | "dncListVersion"
    | "quietHoursTz"
  > = {
    userId: opts.userId,
    channel: opts.audit?.channel ?? "call",
    destinationE164: opts.phone,
    requestedPurpose,
    effectivePurpose,
    derivedRelationship: opts.audit?.derivedRelationship ?? null,
    attested: opts.audit?.attested === true,
    attestationTextVersion: opts.audit?.attestationTextVersion ?? null,
    confirmations: opts.audit?.confirmations ?? null,
    customerSince: opts.audit?.customerSince ?? null,
    actorIp: opts.audit?.actorIp ?? null,
    userAgent: opts.audit?.userAgent ?? null,
  };
  let salesStamp: { userId: string; at: Date; version: string } | null = null;

  async function finish(
    result: OutboundDialGateResult,
    extra?: Partial<
      Pick<
        OutboundAuditDecision,
        "dncChecked" | "dncSource" | "dncResult" | "dncListVersion" | "quietHoursTz"
      >
    >,
  ): Promise<OutboundDialGateResult> {
    const confirmations = {
      ...(auditBase.confirmations ?? {}),
      ...(salesStamp
        ? {
            salesAttestation: {
              userId: salesStamp.userId,
              at: salesStamp.at.toISOString(),
              version: salesStamp.version,
            },
          }
        : {}),
    };
    await recordOutboundPurposeAudit({
      ...auditBase,
      confirmations,
      salesAttestationUserId: salesStamp?.userId ?? null,
      salesAttestationAt: salesStamp?.at ?? null,
      salesAttestationVersion: salesStamp?.version ?? null,
      dncChecked: extra?.dncChecked === true,
      dncSource: extra?.dncSource ?? "none",
      dncResult: extra?.dncResult ?? null,
      dncListVersion: extra?.dncListVersion ?? null,
      quietHoursTz: extra?.quietHoursTz ?? null,
      decision: result.allowed ? "allowed" : "blocked",
      blockCode: result.allowed ? null : result.reason,
    });
    return result;
  }

  const oneOffSales = requiresFederalDncScreening && opts.salesScreening === "one_off";
  let workspaceSalesSettings: Awaited<ReturnType<typeof loadWorkspaceSalesSettings>> = null;
  if (oneOffSales) {
    workspaceSalesSettings = await loadWorkspaceSalesSettings(opts.userId);
    const attestation = currentSalesDncAttestation(workspaceSalesSettings);
    if (attestation) salesStamp = attestation;
  } else if (requiresFederalDncScreening) {
    const federalGate = assertFederalDncForMarketing();
    if (!federalGate.allowed) {
      return finish(
        {
          allowed: false,
          status: "AutoDialFailed",
          reason: "federal_dnc_unconfigured",
          metadataPatch: { federal_dnc_configured: false },
          federalDncCode: federalGate.code,
          federalDncMessage: federalGate.message,
          customerMessage: federalGate.message,
        },
        { dncResult: "unconfigured" },
      );
    }
  }

  let quietHoursTz: string | null = null;
  if (!isLiveSessionFollowUp) {
    const callingHours = resolveCallingHoursForPhone(opts.phone);
    quietHoursTz = callingHours.timeZone ?? null;
    if (!callingHours.allowed) {
      const customerMessage = quietHoursBlockedMessage(callingHours);
      return finish(
        {
          allowed: false,
          status: "AutoDialFailed",
          reason: "outside_permitted_calling_hours",
          customerMessage,
          metadataPatch: {
            auto_dial_error: customerMessage,
            calling_hours: callingHours,
          },
        },
        { quietHoursTz },
      );
    }
  }

  if (opts.lastCalledAt && !isRequestedCallback) {
    const elapsed = Date.now() - opts.lastCalledAt.getTime();
    if (elapsed < DUPLICATE_WINDOW_MS) {
      const nextEligible = new Date(opts.lastCalledAt.getTime() + DUPLICATE_WINDOW_MS);
      return finish(
        {
          allowed: false,
          status: LEAD_STATUS.CALLBACK_SCHEDULED,
          reason: "self_recent_call_scheduled",
          customerMessage: ONE_CALL_PER_DAY_MESSAGE,
          metadataPatch: {
            next_eligible_at: nextEligible.toISOString(),
            duplicate_guard: "self_within_24h",
          },
        },
        { quietHoursTz },
      );
    }
  }

  if (!isRequestedCallback) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const otherConditions = [
      eq(schema.outboundLeads.userId, opts.userId),
      eq(schema.outboundLeads.customerNumber, opts.phone),
      eq(schema.outboundLeads.demo, false),
      gte(schema.outboundLeads.lastCalledAt, since),
    ];
    if (opts.leadId != null && opts.leadId !== "") {
      otherConditions.push(ne(schema.outboundLeads.id, BigInt(opts.leadId)));
    }

    const manualService =
      !requiresFederalDncScreening &&
      opts.manualCallPurpose !== undefined &&
      SERVICE_PURPOSES.includes(opts.manualCallPurpose);
    const recentQuery = drizzle
      .select({
        id: schema.outboundLeads.id,
        callId: schema.outboundLeads.callId,
        metadata: schema.outboundLeads.metadata,
      })
      .from(schema.outboundLeads)
      .where(and(...otherConditions));
    const [otherRecent, secondRecent] = manualService
      ? await recentQuery.orderBy(desc(schema.outboundLeads.lastCalledAt)).limit(2)
      : await recentQuery.limit(1);
    const outcome = manualService && otherRecent ? confirmedCarrierOutcome(otherRecent) : null;
    const callbackAllowed =
      opts.manualCallPurpose === "callback" &&
      outcome !== null &&
      CARRIER_TERMINAL_STATES.includes(outcome);
    const retryAllowed = !secondRecent && (outcome === "busy" || outcome === "no-answer");

    if (otherRecent && !callbackAllowed && !retryAllowed) {
      return finish(
        {
          allowed: false,
          status: LEAD_STATUS.SKIPPED_DUPLICATE,
          reason: "skipped_duplicate",
          customerMessage: ONE_CALL_PER_DAY_MESSAGE,
          metadataPatch: {
            duplicate_of_lead_id: jsonSafeId(otherRecent.id),
            duplicate_guard: "other_within_24h",
          },
        },
        { quietHoursTz },
      );
    }
  }

  if (await isDncBlocked(opts.userId, opts.phone)) {
    return finish(
      {
        allowed: false,
        status: LEAD_STATUS.BLOCKED_DNC,
        reason: "blocked_internal_dnc",
        consentLogEvent: "outbound_blocked_dnc",
        customerMessage: INTERNAL_DNC_MESSAGE,
      },
      { quietHoursTz },
    );
  }

  if (oneOffSales && !salesStamp) {
    return finish(
      {
        allowed: false,
        status: "AutoDialFailed",
        reason: "sales_attestation_required",
        customerMessage: SALES_ATTESTATION_REQUIRED_MESSAGE,
        federalDncMessage: SALES_ATTESTATION_REQUIRED_MESSAGE,
      },
      { dncResult: "skipped", quietHoursTz },
    );
  }

  let dncChecked = false;
  let dncResult = "skipped";
  let dncListVersion: string | null = null;
  if (requiresFederalDncScreening) {
    if (!oneOffSales) {
      workspaceSalesSettings = await loadWorkspaceSalesSettings(opts.userId);
    }
    const storedRegistration = workspaceSalesSettings?.dncSellerRegistration;
    const screenThisNumber =
      !oneOffSales ||
      (getDncProvider().configured() &&
        (Boolean(workspaceSalesSettings?.dncSan?.trim()) || storedRegistration != null));
    if (screenThisNumber) {
      const seller = evaluateDncSellerRegistration(
        readStoredDncSellerRegistration(storedRegistration),
        opts.phone,
      );
      if (!seller.allowed) {
        const uncovered = seller.code === "SELLER_DNC_AREA_CODE_NOT_COVERED";
        return finish(
          {
            allowed: false,
            status: uncovered ? LEAD_STATUS.BLOCKED_TCPA : "AutoDialFailed",
            reason: uncovered ? "blocked_tcpa" : "federal_dnc_unconfigured",
            federalDncCode: seller.code,
            federalDncMessage: seller.message,
            customerMessage: seller.message,
          },
          { dncResult: seller.code, quietHoursTz },
        );
      }

      const lookup = await lookupFederalDnc(opts.phone, {
        vendorProjectId: seller.vendorProjectId,
      });
      if (lookup.source !== "vendor") {
        return finish(
          {
            allowed: false,
            status: "AutoDialFailed",
            reason: "federal_dnc_unconfigured",
            federalDncCode: "FEDERAL_DNC_LOOKUP_FAILED",
            federalDncMessage: SALES_DNC_LOOKUP_FAILED_MESSAGE,
            customerMessage: SALES_DNC_LOOKUP_FAILED_MESSAGE,
          },
          { dncResult: lookup.source, quietHoursTz },
        );
      }

      dncChecked = true;
      dncResult = lookup.listed ? "listed" : "clear";
      dncListVersion = lookup.list_version;
      if (lookup.listed) {
        return finish(
          {
            allowed: false,
            status: LEAD_STATUS.BLOCKED_TCPA,
            reason: "blocked_tcpa",
            metadataPatch: { federal_dnc_blocked: true },
            consentLogEvent: "outbound_blocked_tcpa",
            federalDncMessage: SALES_DNC_LISTED_MESSAGE,
            customerMessage: SALES_DNC_LISTED_MESSAGE,
          },
          { dncChecked, dncSource: "vendor", dncResult, dncListVersion, quietHoursTz },
        );
      }
    }
  }

  const tcpaDecision = evaluateOutboundConsent({
    phone: opts.phone,
    is_internal_dnc: false,
    is_marketing_call: isMarketingCall,
    has_express_written_consent: hasExpressWrittenConsent,
  });

  if (!tcpaDecision.allowed) {
    return finish(
      {
        allowed: false,
        status: LEAD_STATUS.BLOCKED_TCPA,
        reason: "blocked_tcpa",
        tcpaDecision,
        metadataPatch: { tcpa: tcpaDecision },
        consentLogEvent: "outbound_blocked_tcpa",
        customerMessage: tcpaDecision.disclosure_script || INTERNAL_DNC_MESSAGE,
      },
      {
        dncChecked,
        dncSource: dncChecked ? "vendor" : "none",
        dncResult,
        dncListVersion,
        quietHoursTz,
      },
    );
  }

  return finish(
    { allowed: true, tcpaDecision },
    {
      dncChecked,
      dncSource: dncChecked ? "vendor" : "none",
      dncResult,
      dncListVersion,
      quietHoursTz,
    },
  );
}
