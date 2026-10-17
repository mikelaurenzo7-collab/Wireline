export const OUTBOUND_CALL_PURPOSES = [
  "service_or_requested",
  "marketing_or_sales",
  "callback",
] as const;

export type OutboundCallPurpose = (typeof OUTBOUND_CALL_PURPOSES)[number];

export const OUTBOUND_CONSENT_VERSION = "tcpa-v1";

/**
 * Current product capability, shared by customer guidance and readiness.
 * This descriptor never authorizes a call. The server must independently
 * verify recipient evidence before this capability can become available.
 */
export const DIRECT_OUTBOUND_AVAILABILITY = Object.freeze({
  available: false,
  code: "AUDITABLE_RECIPIENT_CONSENT",
});

export function isOutboundCallPurpose(value: unknown): value is OutboundCallPurpose {
  return typeof value === "string" && (OUTBOUND_CALL_PURPOSES as readonly string[]).includes(value);
}

export function isMarketingCallPurpose(callPurpose: OutboundCallPurpose): boolean {
  return callPurpose === "marketing_or_sales";
}

/**
 * Purpose labels arriving at a direct-send boundary are caller assertions, not
 * evidence of an established business relationship or a consumer request.
 * Unless the server resolved such an artifact independently, fail closed to
 * the marketing class even when the caller selected a service/callback label.
 */
export function classifyUntrustedDirectDial(input: {
  callPurpose: OutboundCallPurpose;
  hasServerOwnedNonMarketingArtifact?: boolean;
}): {
  requestedCallPurpose: OutboundCallPurpose;
  effectiveCallPurpose: OutboundCallPurpose;
  isMarketingCall: boolean;
} {
  const isMarketingCall =
    isMarketingCallPurpose(input.callPurpose) || input.hasServerOwnedNonMarketingArtifact !== true;
  return {
    requestedCallPurpose: input.callPurpose,
    effectiveCallPurpose: isMarketingCall ? "marketing_or_sales" : input.callPurpose,
    isMarketingCall,
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
 * A direct-dial classification originates at an untrusted client boundary, so
 * its Federal DNC obligation is invariant rather than purpose-dependent.
 */
export function requiresFederalDncScreeningForDirectDial(): true {
  return true;
}

export function outboundConsentMetadata(input: {
  callPurpose: OutboundCallPurpose;
  requestedCallPurpose?: OutboundCallPurpose;
  hasExpressWrittenConsent?: boolean;
  source: "web" | "mobile" | "campaign" | "bulk";
  consentSource?: string;
  consentLeadId?: string;
}): Record<string, unknown> {
  return {
    call_purpose: input.callPurpose,
    ...(input.requestedCallPurpose && input.requestedCallPurpose !== input.callPurpose
      ? { client_requested_call_purpose: input.requestedCallPurpose }
      : {}),
    consent_version: OUTBOUND_CONSENT_VERSION,
    has_express_written_consent: normalizedExpressConsent(input),
    source: input.source,
    ...(input.consentSource ? { consent_source: input.consentSource } : {}),
    ...(input.consentLeadId ? { consent_lead_id: input.consentLeadId } : {}),
  };
}
