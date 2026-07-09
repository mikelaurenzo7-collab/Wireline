import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outbound compliance contract", () => {
  it("requires explicit callPurpose on web and mobile direct dial APIs", () => {
    const web = read("src/routes/outbound-routes.ts");
    const mobile = read("src/routes/mobile-routes.ts");

    for (const source of [web, mobile]) {
      expect(source).toContain("callPurpose: z.enum(OUTBOUND_CALL_PURPOSES)");
      expect(source).not.toContain("callPurpose: z.enum(OUTBOUND_CALL_PURPOSES).optional()");
      expect(source).not.toContain('default("marketing_or_sales")');
      expect(source).toContain("isMarketingCallPurpose(callPurpose)");
      expect(source).toContain("outboundConsentMetadata({");
      expect(source).toContain("isDncBlocked(req.user.id, customerNumber)");
      expect(source).toContain("isFederalDncListed(customerNumber)");
      expect(source).toContain("is_federal_dnc: isFederalDnc");
      expect(source).toContain("tcpaBlocked: true");
    }
  });

  it("keeps consent metadata durable and source-specific", () => {
    const purpose = read("src/lib/outbound-call-purpose.ts");
    const web = read("src/routes/outbound-routes.ts");
    const mobile = read("src/routes/mobile-routes.ts");

    expect(purpose).toContain('OUTBOUND_CONSENT_VERSION = "tcpa-v1"');
    expect(purpose).toContain("call_purpose: input.callPurpose");
    expect(purpose).toContain("consent_version: OUTBOUND_CONSENT_VERSION");
    expect(purpose).toContain("has_express_written_consent: normalizedExpressConsent(input)");
    expect(purpose).toContain("source: input.source");
    expect(purpose).not.toContain("normalizeOutboundCallPurpose");
    expect(web).toContain('source: "web"');
    expect(mobile).toContain('source: "mobile"');
  });

  it("keeps bulk and campaign dialing explicitly marketing-only", () => {
    const outbound = read("src/routes/outbound-routes.ts");
    const campaignDialer = read("src/services/campaign-dialer.ts");
    const dialGate = read("src/lib/outbound-dial-gate.ts");

    expect(outbound).toContain('callPurpose: "marketing_or_sales"');
    expect(outbound).toContain('source: "bulk"');
    expect(outbound).toContain("has_express_written_consent: req.body.has_express_written_consent");
    expect(campaignDialer).toContain("evaluateOutboundDialGate");
    expect(dialGate).toContain("is_marketing_call: true");
    expect(dialGate).toContain("has_express_written_consent === true");
    expect(campaignDialer).toContain('call_purpose: "marketing_or_sales"');
    expect(dialGate).toContain("isFederalDncListed");
    expect(campaignDialer).toContain('source: "campaign"');
  });

  it("documents required callPurpose in the public API contract", () => {
    const openapi = read("src/lib/openapi-spec.ts");

    expect(openapi).toContain('required: ["agentId", "customerNumber", "callPurpose"]');
    expect(openapi).toContain('"/api/outbound/dial"');
    expect(openapi).toContain('"/api/mobile/calls/outbound"');
    expect(openapi).toContain("DNC or TCPA consent gate blocked the call.");
    expect(openapi).toContain("Siri and CarPlay callbacks use non-marketing purposes");
  });
});
