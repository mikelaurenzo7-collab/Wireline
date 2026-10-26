import { describe, expect, it } from "vitest";
import {
  OUTBOUND_CONSENT_VERSION,
  classifyUntrustedDirectDial,
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  normalizedExpressConsent,
  outboundCallingEnabledFor,
  outboundConsentMetadata,
  sanitizeUntrustedOutboundMetadata,
  screenedDirectOutboundCall,
} from "../src/lib/outbound-call-purpose";

describe("isOutboundCallPurpose", () => {
  it("accepts the three valid purposes only", () => {
    expect(isOutboundCallPurpose("service_or_requested")).toBe(true);
    expect(isOutboundCallPurpose("marketing_or_sales")).toBe(true);
    expect(isOutboundCallPurpose("callback")).toBe(true);
  });
  it("rejects bogus / non-string values (e.g. a stray 'active')", () => {
    expect(isOutboundCallPurpose("active")).toBe(false);
    expect(isOutboundCallPurpose("")).toBe(false);
    expect(isOutboundCallPurpose(undefined)).toBe(false);
    expect(isOutboundCallPurpose(3)).toBe(false);
  });
});

describe("screened direct outbound", () => {
  it("places every direct label as one screened call without express consent", () => {
    for (const requested of ["service_or_requested", "callback", "marketing_or_sales"] as const) {
      expect(screenedDirectOutboundCall(requested)).toEqual({
        requestedCallPurpose: requested,
        callPurpose: "marketing_or_sales",
        isMarketingCall: true,
        requireFederalDncScreening: true,
        hasExpressWrittenConsent: false,
        isRequestedCallback: false,
      });
    }
    expect(
      outboundCallingEnabledFor("marketing_or_sales", { general: false, nonMarketing: false }),
    ).toBe(true);
  });
});

describe("isMarketingCallPurpose", () => {
  it("is true only for marketing_or_sales", () => {
    expect(isMarketingCallPurpose("marketing_or_sales")).toBe(true);
    expect(isMarketingCallPurpose("service_or_requested")).toBe(false);
    expect(isMarketingCallPurpose("callback")).toBe(false);
  });
});

describe("classifyUntrustedDirectDial", () => {
  it("fails caller-selected service and callback labels closed as marketing", () => {
    for (const callPurpose of ["service_or_requested", "callback"] as const) {
      expect(classifyUntrustedDirectDial({ callPurpose })).toEqual({
        requestedCallPurpose: callPurpose,
        effectiveCallPurpose: "marketing_or_sales",
        isMarketingCall: true,
      });
    }
  });

  it("permits non-marketing classification only with a server-owned artifact", () => {
    expect(
      classifyUntrustedDirectDial({
        callPurpose: "service_or_requested",
        hasServerOwnedNonMarketingArtifact: true,
      }),
    ).toEqual({
      requestedCallPurpose: "service_or_requested",
      effectiveCallPurpose: "service_or_requested",
      isMarketingCall: false,
    });
  });
});

describe("sanitizeUntrustedOutboundMetadata", () => {
  it("removes compliance and provider-control claims while preserving ordinary CRM metadata", () => {
    expect(
      sanitizeUntrustedOutboundMetadata({
        callback_requested_via: "phone_call",
        call_purpose: "callback",
        client_requested_call_purpose: "callback",
        has_express_written_consent: true,
        consent_version: "spoofed",
        consent_source: "spoofed",
        federal_dnc_configured: true,
        tcpa: { allowed: true },
        tcpa_override: true,
        native_voice: { placement_id: "attacker" },
        auto_dial: true,
        auto_dial_status: "complete",
        placement_claimed_at: "2099-01-01",
        crm_owner: "rep-42",
        campaign_note: "requested a demo",
      }),
    ).toEqual({
      crm_owner: "rep-42",
      campaign_note: "requested a demo",
    });
  });
});

describe("normalizedExpressConsent (TCPA gate input)", () => {
  it("is true ONLY for marketing_or_sales with explicit written consent", () => {
    expect(
      normalizedExpressConsent({
        callPurpose: "marketing_or_sales",
        hasExpressWrittenConsent: true,
      }),
    ).toBe(true);
  });
  it("is false for marketing without the explicit flag (missing or false)", () => {
    expect(normalizedExpressConsent({ callPurpose: "marketing_or_sales" })).toBe(false);
    expect(
      normalizedExpressConsent({
        callPurpose: "marketing_or_sales",
        hasExpressWrittenConsent: false,
      }),
    ).toBe(false);
  });
  it("is false for non-marketing purposes regardless of the flag", () => {
    expect(
      normalizedExpressConsent({
        callPurpose: "service_or_requested",
        hasExpressWrittenConsent: true,
      }),
    ).toBe(false);
    expect(
      normalizedExpressConsent({ callPurpose: "callback", hasExpressWrittenConsent: true }),
    ).toBe(false);
  });
});

describe("outboundConsentMetadata", () => {
  it("stamps the consent version and the normalized consent flag", () => {
    const meta = outboundConsentMetadata({
      callPurpose: "marketing_or_sales",
      hasExpressWrittenConsent: true,
      source: "campaign",
    });
    expect(meta.consent_version).toBe(OUTBOUND_CONSENT_VERSION);
    expect(meta.call_purpose).toBe("marketing_or_sales");
    expect(meta.has_express_written_consent).toBe(true);
    expect(meta.source).toBe("campaign");
  });
  it("records has_express_written_consent=false for non-marketing even with the flag set", () => {
    const meta = outboundConsentMetadata({
      callPurpose: "callback",
      hasExpressWrittenConsent: true,
      source: "web",
    });
    expect(meta.has_express_written_consent).toBe(false);
  });
  it("includes consent_source / consent_lead_id only when provided", () => {
    const bare = outboundConsentMetadata({ callPurpose: "callback", source: "web" });
    expect("consent_source" in bare).toBe(false);
    expect("consent_lead_id" in bare).toBe(false);
    const full = outboundConsentMetadata({
      callPurpose: "callback",
      source: "web",
      consentSource: "landing-form",
      consentLeadId: "lead_123",
    });
    expect(full.consent_source).toBe("landing-form");
    expect(full.consent_lead_id).toBe("lead_123");
  });

  it("retains a reclassified caller purpose as audit context, never as the effective class", () => {
    const reclassified = outboundConsentMetadata({
      callPurpose: "marketing_or_sales",
      requestedCallPurpose: "service_or_requested",
      source: "web",
    });
    expect(reclassified.call_purpose).toBe("marketing_or_sales");
    expect(reclassified.client_requested_call_purpose).toBe("service_or_requested");

    const unchanged = outboundConsentMetadata({
      callPurpose: "marketing_or_sales",
      requestedCallPurpose: "marketing_or_sales",
      source: "web",
    });
    expect("client_requested_call_purpose" in unchanged).toBe(false);
  });
});
