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

  it("screens a direct dial without a recipient signature and keeps federal DNC mandatory", () => {
    const directDialRoutes = [
      "src/routes/outbound-dial-atomic-routes.ts",
      "src/routes/outbound-routes.ts",
    ];

    for (const route of directDialRoutes) {
      const source = read(route);
      expect(source).toContain("const screening = screenedDirectOutboundCall(callPurpose)");
      expect(source).toContain("const effectiveCallPurpose = screening.callPurpose");
      expect(source).toContain("callPurpose: effectiveCallPurpose");
      expect(source).toContain("requestedCallPurpose: screening.requestedCallPurpose");
      expect(source).toContain("requireFederalDncScreening: screening.requireFederalDncScreening");
      expect(source).toContain("isRequestedCallback: screening.isRequestedCallback");
      expect(source).toContain("hasExpressWrittenConsent: false");
      expect(source).not.toContain("await inspectOutboundRecipientPermission({");
      expect(source).not.toContain("artifactId: consentArtifactId");
      expect(source).toContain("readNativeOutboundRequestReplay");
    }
    const mobile = read("src/routes/mobile-routes.ts");
    expect(mobile).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(mobile).not.toContain("placeOutboundCall");
    const service = read("src/lib/voice/outbound-call-service.ts");
    const screeningAt = service.indexOf("issueOutboundScreeningReceipt({");
    const signedAt = service.indexOf("await inspectOutboundRecipientPermission({");
    const createAt = service.indexOf("await twilio.calls.create({");
    expect(signedAt).toBeGreaterThan(-1);
    expect(screeningAt).toBeGreaterThan(signedAt);
    expect(createAt).toBeGreaterThan(screeningAt);
    expect(service).toContain("input.consentArtifactId");
  });
});
