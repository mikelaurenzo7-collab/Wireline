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
  it("trusts a non-sales purpose and keeps sales on federal screening", () => {
    expect(classifyUntrustedDirectDial({ callPurpose: "appointment_service", nonsalesAttested: true })).toMatchObject({
      effectiveCallPurpose: "appointment_service",
      isMarketingCall: false,
    });
    expect(classifyUntrustedDirectDial({ callPurpose: "sales" })).toMatchObject({
      effectiveCallPurpose: "sales",
      isMarketingCall: true,
    });
    expect(requiresFederalDncScreeningForDirectDial("sales")).toBe(true);
    expect(requiresFederalDncScreeningForDirectDial("personal")).toBe(false);
    expect(requiresFederalDncScreeningForDirectDial("appointment_service")).toBe(false);
    expect(requiresFederalDncScreeningForDirectDial("existing_customer")).toBe(false);
    expect(requiresFederalDncScreeningForDirectDial("returning_contact")).toBe(false);
    expect(requiresFederalDncScreeningForDirectDial("sales", { returning: true })).toBe(false);
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

  it("makes Federal DNC screening depend on the purpose", () => {
    expect(requiresFederalDncScreeningForDirectDial()).toBe(true);
    expect(requiresFederalDncScreeningForDirectDial("appointment_service")).toBe(false);
  });

  it("screens a direct dial without a recipient signature and keeps federal DNC mandatory", () => {
    const directDialRoutes = [
      "src/routes/outbound-dial-atomic-routes.ts",
      "src/routes/outbound-routes.ts",
    ];

    for (const route of directDialRoutes) {
      const source = read(route);
      expect(source).toContain("const screening = manual.screening");
      expect(source).toContain("const effectiveCallPurpose = screening.callPurpose");
      expect(source).toContain("callPurpose: effectiveCallPurpose");
      expect(source).toContain("requestedCallPurpose: screening.requestedCallPurpose");
      expect(source).toContain("requireFederalDncScreening: screening.requireFederalDncScreening");
      expect(source).toContain('salesScreening: screening.requireFederalDncScreening ? "one_off" : "bulk"');
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
