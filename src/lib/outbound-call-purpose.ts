export const OUTBOUND_CALL_PURPOSES = [
  "service_or_requested",
  "marketing_or_sales",
  "callback",
] as const;

export type OutboundCallPurpose = (typeof OUTBOUND_CALL_PURPOSES)[number];

export const OUTBOUND_CONSENT_VERSION = "tcpa-v1";

export function isOutboundCallPurpose(value: unknown): value is OutboundCallPurpose {
  return typeof value === "string" && (OUTBOUND_CALL_PURPOSES as readonly string[]).includes(value);
}

export function isMarketingCallPurpose(callPurpose: OutboundCallPurpose): boolean {
  return callPurpose === "marketing_or_sales";
}

export function normalizedExpressConsent(input: {
  callPurpose: OutboundCallPurpose;
  hasExpressWrittenConsent?: boolean;
}): boolean {
  return isMarketingCallPurpose(input.callPurpose) && input.hasExpressWrittenConsent === true;
}

export function outboundConsentMetadata(input: {
  callPurpose: OutboundCallPurpose;
  hasExpressWrittenConsent?: boolean;
  source: "web" | "mobile" | "campaign" | "bulk";
  consentSource?: string;
  consentLeadId?: string;
}): Record<string, unknown> {
  return {
    call_purpose: input.callPurpose,
    consent_version: OUTBOUND_CONSENT_VERSION,
    has_express_written_consent: normalizedExpressConsent(input),
    source: input.source,
    ...(input.consentSource ? { consent_source: input.consentSource } : {}),
    ...(input.consentLeadId ? { consent_lead_id: input.consentLeadId } : {}),
  };
}
