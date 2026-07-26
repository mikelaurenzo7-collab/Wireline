import { describe, expect, it } from "vitest";
import {
  OUTBOUND_CONSENT_VERSION,
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
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

describe("isMarketingCallPurpose", () => {
  it("is true only for marketing_or_sales", () => {
    expect(isMarketingCallPurpose("marketing_or_sales")).toBe(true);
    expect(isMarketingCallPurpose("service_or_requested")).toBe(false);
    expect(isMarketingCallPurpose("callback")).toBe(false);
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
});
