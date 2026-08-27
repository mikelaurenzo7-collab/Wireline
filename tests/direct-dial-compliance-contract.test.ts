import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifyUntrustedDirectDial,
  hasAuditableExpressConsentArtifact,
  requiresFederalDncScreeningForDirectDial,
} from "../src/lib/outbound-call-purpose";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("direct-dial compliance contract", () => {
  it("does not trust a client-selected service or callback label as a non-marketing artifact", () => {
    for (const callPurpose of ["service_or_requested", "callback"] as const) {
      expect(classifyUntrustedDirectDial({ callPurpose })).toMatchObject({
        effectiveCallPurpose: "marketing_or_sales",
        isMarketingCall: true,
      });
    }
  });

  it("rejects client-supplied consent descriptions until the server verifies an artifact", () => {
    expect(hasAuditableExpressConsentArtifact({ consentSource: "manual_attestation" })).toBe(false);
    expect(
      hasAuditableExpressConsentArtifact({
        consentSource: "manual_attestation",
        consentLeadId: "lead-123",
      }),
    ).toBe(false);
    expect(hasAuditableExpressConsentArtifact({ consentSource: "web_form" })).toBe(false);
    expect(
      hasAuditableExpressConsentArtifact({
        consentSource: "web_form",
        consentLeadId: "lead-123",
      }),
    ).toBe(false);
    expect(
      hasAuditableExpressConsentArtifact({
        consentSource: "crm",
        consentLeadId: "arbitrary-client-value",
      }),
    ).toBe(false);
    expect(hasAuditableExpressConsentArtifact({})).toBe(false);
  });

  it("makes Federal DNC screening unconditional for direct dial", () => {
    expect(requiresFederalDncScreeningForDirectDial()).toBe(true);
  });

  it("forces Federal DNC screening in every web and mobile direct-dial adapter", () => {
    const directDialRoutes = [
      "src/routes/outbound-dial-atomic-routes.ts",
      "src/routes/outbound-routes.ts",
      "src/routes/native-mobile-voice-routes.ts",
      "src/routes/mobile-routes.ts",
    ];

    for (const route of directDialRoutes) {
      const source = read(route);
      expect(source).toContain("hasAuditableExpressConsentArtifact({");
      expect(source).toContain("classifyUntrustedDirectDial({ callPurpose })");
      expect(source).toContain("callPurpose: effectiveCallPurpose");
      expect(source).toContain("requestedCallPurpose: callPurpose");
      expect(source).toContain("const marketing = purpose.isMarketingCall");
      expect(source).not.toContain("isMarketingCallPurpose(callPurpose)");
      expect(source).toContain("claimedExpressConsent && hasAuditableConsentArtifact");
      expect(source).toContain(
        "requireFederalDncScreening: requiresFederalDncScreeningForDirectDial()",
      );
      expect(source).toContain("hasExpressWrittenConsent: expressConsent");
      expect(source).toContain("client-supplied source or lead references are not accepted");
    }
  });
});
