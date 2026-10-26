import { describe, expect, it } from "vitest";
import {
  OUTBOUND_CONSENT_VERSION,
  classifyUntrustedDirectDial,
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  normalizedExpressConsent,
  outboundCallingEnabledFor,
  outboundConsentMetadata,
  resolveEffectiveOutboundPurpose,
  salesContentWarning,
  sanitizeUntrustedOutboundMetadata,
  screenedDirectOutboundCall,
} from "../src/lib/outbound-call-purpose";

describe("isOutboundCallPurpose", () => {
  it("accepts current purposes and the legacy labels", () => {
    for (const purpose of [
      "personal",
      "returning_contact",
      "appointment_service",
      "existing_customer",
      "sales",
      "callback",
      "service_or_requested",
      "marketing_or_sales",
    ]) {
      expect(isOutboundCallPurpose(purpose)).toBe(true);
    }
  });
  it("rejects bogus / non-string values (e.g. a stray 'active')", () => {
    expect(isOutboundCallPurpose("active")).toBe(false);
    expect(isOutboundCallPurpose("")).toBe(false);
    expect(isOutboundCallPurpose(undefined)).toBe(false);
    expect(isOutboundCallPurpose(3)).toBe(false);
  });
});

describe("screened direct outbound", () => {
  it("screens federal DNC only for sales and loosens sales when they called recently", () => {
    expect(screenedDirectOutboundCall("personal")).toMatchObject({
      callPurpose: "personal",
      isMarketingCall: false,
      requireFederalDncScreening: false,
      hasExpressWrittenConsent: false,
    });
    expect(screenedDirectOutboundCall("appointment_service").requireFederalDncScreening).toBe(false);
    expect(screenedDirectOutboundCall("existing_customer").requireFederalDncScreening).toBe(false);
    expect(screenedDirectOutboundCall("returning_contact")).toMatchObject({
      callPurpose: "returning_contact",
      requireFederalDncScreening: false,
      isRequestedCallback: false,
    });
    expect(screenedDirectOutboundCall("sales")).toMatchObject({
      requestedCallPurpose: "sales",
      callPurpose: "sales",
      isMarketingCall: true,
      requireFederalDncScreening: true,
      hasExpressWrittenConsent: false,
      isRequestedCallback: false,
    });
    expect(screenedDirectOutboundCall("callback")).toMatchObject({
      callPurpose: "callback",
      isMarketingCall: false,
      requireFederalDncScreening: false,
      hasExpressWrittenConsent: false,
      isRequestedCallback: false,
    });
    expect(screenedDirectOutboundCall("marketing_or_sales").callPurpose).toBe("sales");
    expect(screenedDirectOutboundCall("service_or_requested").callPurpose).toBe("appointment_service");
    expect(screenedDirectOutboundCall("sales", { returning: true })).toMatchObject({
      callPurpose: "returning_contact",
      requireFederalDncScreening: false,
    });
    expect(screenedDirectOutboundCall("appointment_service", { returning: true }).callPurpose).toBe(
      "appointment_service",
    );
    expect(
      outboundCallingEnabledFor("sales", { general: false, nonMarketing: false }),
    ).toBe(true);
  });
});

describe("effective purpose", () => {
  it("reverts an existing customer older than 18 months to sales, then a relationship can loosen it", () => {
    const stale = new Date();
    stale.setMonth(stale.getMonth() - 19);
    expect(
      resolveEffectiveOutboundPurpose({ requested: "existing_customer", customerSince: stale }),
    ).toMatchObject({ effective: "sales", revertedStaleCustomer: true });
    expect(
      resolveEffectiveOutboundPurpose({
        requested: "existing_customer",
        customerSince: stale,
        relationshipReturning: true,
      }).effective,
    ).toBe("returning_contact");
    const current = new Date();
    current.setMonth(current.getMonth() - 2);
    expect(
      resolveEffectiveOutboundPurpose({
        requested: "existing_customer",
        customerSince: current,
      }).effective,
    ).toBe("existing_customer");
  });

  it("warns when a non-sales note sounds like a promotion and does not block", () => {
    expect(salesContentWarning("We have a limited time discount")).toMatch(/Switch to Sales/);
    expect(salesContentWarning("Confirming your Tuesday appointment")).toBeNull();
  });
});

describe("isMarketingCallPurpose", () => {
  it("is true only for sales labels", () => {
    expect(isMarketingCallPurpose("marketing_or_sales")).toBe(true);
    expect(isMarketingCallPurpose("sales")).toBe(true);
    expect(isMarketingCallPurpose("service_or_requested")).toBe(false);
    expect(isMarketingCallPurpose("callback")).toBe(false);
  });
});

describe("classifyUntrustedDirectDial", () => {
  it("keeps an attested non-sales purpose and leaves an unattested sales label as sales", () => {
    expect(classifyUntrustedDirectDial({ callPurpose: "sales" })).toMatchObject({
      effectiveCallPurpose: "sales",
      isMarketingCall: true,
    });
    expect(
      classifyUntrustedDirectDial({
        callPurpose: "appointment_service",
        nonsalesAttested: true,
      }),
    ).toMatchObject({
      effectiveCallPurpose: "appointment_service",
      isMarketingCall: false,
    });
  });

  it("permits non-marketing classification with a server-owned artifact", () => {
    expect(
      classifyUntrustedDirectDial({
        callPurpose: "service_or_requested",
        hasServerOwnedNonMarketingArtifact: true,
      }),
    ).toEqual({
      requestedCallPurpose: "appointment_service",
      effectiveCallPurpose: "appointment_service",
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
    expect(meta.call_purpose).toBe("sales");
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
    expect(reclassified.call_purpose).toBe("sales");
    expect(reclassified.client_requested_call_purpose).toBe("appointment_service");

    const unchanged = outboundConsentMetadata({
      callPurpose: "marketing_or_sales",
      requestedCallPurpose: "marketing_or_sales",
      source: "web",
    });
    expect("client_requested_call_purpose" in unchanged).toBe(false);
  });
});
