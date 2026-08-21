import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  hasAuditableExpressConsentArtifact,
  requiresFederalDncScreeningForDirectDial,
} from "../src/lib/outbound-call-purpose";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("direct-dial compliance contract", () => {
  it("does not treat a manual attestation as express-written-consent evidence", () => {
    expect(hasAuditableExpressConsentArtifact({ consentSource: "manual_attestation" })).toBe(false);
    expect(
      hasAuditableExpressConsentArtifact({
        consentSource: "manual_attestation",
        consentLeadId: "lead-123",
      }),
    ).toBe(true);
    expect(hasAuditableExpressConsentArtifact({ consentSource: "web_form" })).toBe(true);
    expect(hasAuditableExpressConsentArtifact({ consentLeadId: "lead-123" })).toBe(true);
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
      expect(source).toContain("claimedExpressConsent && hasAuditableConsentArtifact");
      expect(source).toContain(
        "requireFederalDncScreening: requiresFederalDncScreeningForDirectDial()",
      );
      expect(source).toContain("hasExpressWrittenConsent: expressConsent");
      expect(source).toContain("manual attestation alone is not sufficient");
    }
  });
});
