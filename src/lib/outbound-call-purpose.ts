export const OUTBOUND_PURPOSE_VALUES = [
  "personal",
  "returning_contact",
  "appointment_service",
  "existing_customer",
  "sales",
  "callback",
] as const;

/** Legacy labels still accepted at boundaries. They canonicalize before screening. */
export const LEGACY_OUTBOUND_PURPOSE_VALUES = [
  "service_or_requested",
  "marketing_or_sales",
] as const;

export const OUTBOUND_CALL_PURPOSES = [
  ...OUTBOUND_PURPOSE_VALUES,
  ...LEGACY_OUTBOUND_PURPOSE_VALUES,
] as const;

export type OutboundPurpose = (typeof OUTBOUND_PURPOSE_VALUES)[number];
export type OutboundCallPurpose = (typeof OUTBOUND_CALL_PURPOSES)[number];

export type OutboundCallingAvailability = { general: boolean; nonMarketing: boolean };

/** Inbound call or text within this window is a returning-contact relationship. */
export const OUTBOUND_RELATIONSHIP_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Purchase established-business-relationship window. Older dates revert to sales. */
export const EXISTING_CUSTOMER_WINDOW_MONTHS = 18;

export const SALES_CONTENT_WARNING =
  "This sounds like a sales call. Switch to Sales?";

const PROMO_PATTERN =
  /\b(discount|offer|special|%\s*off|percent off|limited time|sign up today|act now|free trial)\b/i;

export function outboundCallingAvailability(): OutboundCallingAvailability {
  return {
    general: process.env.BOTBOUND_GENERAL_OUTBOUND_ENABLED === "true",
    nonMarketing: process.env.BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED === "true",
  };
}

/**
 * One outbound action. A connected line, plan, screening, and funding are
 * checked separately. An unset activation flag does not hide the call.
 */
export function outboundCallingEnabledFor(
  _purpose: OutboundCallPurpose,
  _availability: OutboundCallingAvailability,
): boolean {
  return true;
}

export function isOutboundCallPurpose(value: unknown): value is OutboundCallPurpose {
  return typeof value === "string" && (OUTBOUND_CALL_PURPOSES as readonly string[]).includes(value);
}

export function canonicalizeOutboundPurpose(value: OutboundCallPurpose): OutboundPurpose {
  if (value === "service_or_requested") return "appointment_service";
  if (value === "marketing_or_sales") return "sales";
  return value;
}

export function isSalesPurpose(purpose: OutboundCallPurpose): boolean {
  return canonicalizeOutboundPurpose(purpose) === "sales";
}

export function isMarketingCallPurpose(callPurpose: OutboundCallPurpose): boolean {
  return isSalesPurpose(callPurpose);
}

export type RelationshipLoosenSignal = {
  /** Server-derived inbound call or text inside the relationship window. */
  returning?: boolean;
};

/**
 * Direct dial keeps the caller's requested label for the audit row.
 * A returning-contact relationship can only loosen a sales label. It never
 * turns a non-sales label into sales.
 */
export function screenedDirectOutboundCall(
  requestedCallPurpose: OutboundCallPurpose,
  relationship?: RelationshipLoosenSignal | null,
) {
  const requested = canonicalizeOutboundPurpose(requestedCallPurpose);
  const callPurpose: OutboundPurpose =
    requested === "sales" && relationship?.returning ? "returning_contact" : requested;
  const sales = callPurpose === "sales";
  return {
    requestedCallPurpose: requested,
    callPurpose,
    isMarketingCall: sales,
    requireFederalDncScreening: sales,
    hasExpressWrittenConsent: false,
    isRequestedCallback: callPurpose === "callback",
  } as const;
}

export const OUTBOUND_CONSENT_VERSION = "tcpa-v1";

/**
 * Current product capability, shared by customer guidance and readiness.
 * This descriptor never authorizes a call. Screening, hours, and the block
 * list still run on every outbound attempt.
 */
export const DIRECT_OUTBOUND_AVAILABILITY = Object.freeze({
  available: true,
  code: "AUDITABLE_RECIPIENT_CONSENT",
});

/**
 * Soft-launch outbound is a reviewed call from a Bot that already has a voice
 * line. Personal coordination and specific business service calls share this
 * gate. Campaign and marketing dialing stay outside it.
 */
export function isReviewedOutboundCandidate(agent: {
  phone_number?: string | null;
  channel?: string | null;
}): boolean {
  return (
    Boolean(agent.phone_number) &&
    (!agent.channel || agent.channel === "voice" || agent.channel === "omnichannel")
  );
}

/**
 * Purpose labels at a direct-send boundary are caller assertions.
 * A server-derived returning relationship loosens sales. A non-sales
 * attestation is trusted. Anything else stays sales.
 */
export function classifyUntrustedDirectDial(input: {
  callPurpose: OutboundCallPurpose;
  hasServerOwnedNonMarketingArtifact?: boolean;
  relationship?: RelationshipLoosenSignal | null;
  nonsalesAttested?: boolean;
}): {
  requestedCallPurpose: OutboundPurpose;
  effectiveCallPurpose: OutboundPurpose;
  isMarketingCall: boolean;
} {
  const requested = canonicalizeOutboundPurpose(input.callPurpose);
  const loosened = screenedDirectOutboundCall(requested, input.relationship);
  const attestedNonSales =
    input.nonsalesAttested === true || input.hasServerOwnedNonMarketingArtifact === true;
  const effectiveCallPurpose: OutboundPurpose =
    loosened.callPurpose !== "sales"
      ? loosened.callPurpose
      : attestedNonSales && requested !== "sales"
        ? requested
        : "sales";
  return {
    requestedCallPurpose: requested,
    effectiveCallPurpose,
    isMarketingCall: effectiveCallPurpose === "sales",
  };
}

const UNTRUSTED_OUTBOUND_METADATA_KEYS = new Set([
  "auto_dial",
  "callback_requested_via",
  "call_purpose",
  "client_requested_call_purpose",
  "has_express_written_consent",
  "native_voice",
  "tcpa",
]);

const UNTRUSTED_OUTBOUND_METADATA_PREFIXES = [
  "auto_dial_",
  "consent_",
  "federal_dnc_",
  "placement_",
  "tcpa_",
];

/**
 * Remove provider-control and compliance claims from metadata accepted at an
 * HTTP/intake boundary. Server-derived metadata is overlaid after this step.
 */
export function sanitizeUntrustedOutboundMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([rawKey]) => {
      const key = rawKey.trim().toLowerCase();
      return (
        !UNTRUSTED_OUTBOUND_METADATA_KEYS.has(key) &&
        !UNTRUSTED_OUTBOUND_METADATA_PREFIXES.some((prefix) => key.startsWith(prefix))
      );
    }),
  );
}

export function normalizedExpressConsent(input: {
  callPurpose: OutboundCallPurpose;
  hasExpressWrittenConsent?: boolean;
}): boolean {
  return isMarketingCallPurpose(input.callPurpose) && input.hasExpressWrittenConsent === true;
}

/**
 * Client-supplied labels and lead identifiers are not written-consent evidence.
 * Direct-dial marketing therefore fails closed until a route resolves a
 * tenant-owned, immutable consent record (signer, phone number, disclosure,
 * timestamp, and source) on the server.
 */
export function hasAuditableExpressConsentArtifact(_input: {
  consentSource?: string;
  consentLeadId?: string;
}): boolean {
  return false;
}

/**
 * Federal DNC screening follows the effective purpose. Only sales is screened.
 * A returning relationship passed here loosens sales before the check.
 */
export function requiresFederalDncScreeningForDirectDial(
  purpose: OutboundCallPurpose = "sales",
  relationship?: RelationshipLoosenSignal | null,
): boolean {
  return screenedDirectOutboundCall(purpose, relationship).requireFederalDncScreening;
}

export function outboundConsentMetadata(input: {
  callPurpose: OutboundCallPurpose;
  requestedCallPurpose?: OutboundCallPurpose;
  hasExpressWrittenConsent?: boolean;
  source: "web" | "mobile" | "campaign" | "bulk";
  consentSource?: string;
  consentLeadId?: string;
}): Record<string, unknown> {
  const effective = canonicalizeOutboundPurpose(input.callPurpose);
  const requested = input.requestedCallPurpose
    ? canonicalizeOutboundPurpose(input.requestedCallPurpose)
    : undefined;
  return {
    call_purpose: effective,
    ...(requested && requested !== effective ? { client_requested_call_purpose: requested } : {}),
    consent_version: OUTBOUND_CONSENT_VERSION,
    has_express_written_consent: normalizedExpressConsent({
      callPurpose: effective,
      hasExpressWrittenConsent: input.hasExpressWrittenConsent,
    }),
    source: input.source,
    ...(input.consentSource ? { consent_source: input.consentSource } : {}),
    ...(input.consentLeadId ? { consent_lead_id: input.consentLeadId } : {}),
  };
}

export function existingCustomerDateIsCurrent(
  customerSince: Date,
  now: Date = new Date(),
): boolean {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - EXISTING_CUSTOMER_WINDOW_MONTHS);
  return customerSince.getTime() >= cutoff.getTime() && customerSince.getTime() <= now.getTime();
}

/**
 * Apply the existing-customer date rule, then let a returning relationship
 * loosen sales. The relationship never tightens a non-sales purpose.
 */
export function resolveEffectiveOutboundPurpose(input: {
  requested: OutboundCallPurpose;
  relationshipReturning?: boolean;
  customerSince?: Date | null;
  now?: Date;
}): {
  requested: OutboundPurpose;
  effective: OutboundPurpose;
  revertedStaleCustomer: boolean;
} {
  const requested = canonicalizeOutboundPurpose(input.requested);
  let effective: OutboundPurpose = requested;
  let revertedStaleCustomer = false;
  if (requested === "existing_customer") {
    if (!input.customerSince || !existingCustomerDateIsCurrent(input.customerSince, input.now)) {
      effective = "sales";
      revertedStaleCustomer = true;
    }
  }
  if (effective === "sales" && input.relationshipReturning) effective = "returning_contact";
  return { requested, effective, revertedStaleCustomer };
}

/** Soft warning only. Promo language on a non-sales attempt is logged, not blocked. */
export function salesContentWarning(text: string | null | undefined): string | null {
  if (!text || !PROMO_PATTERN.test(text)) return null;
  return SALES_CONTENT_WARNING;
}
