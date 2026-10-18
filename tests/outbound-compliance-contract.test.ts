import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getOpenApiSpec } from "../src/lib/openapi-spec";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outbound compliance contract", () => {
  it("requires explicit purpose on web and independently closes native outbound", () => {
    const web = read("src/routes/outbound-routes.ts");
    const mobile = read("src/routes/mobile-routes.ts");
    const gate = read("src/lib/outbound-dial-gate.ts");

    for (const source of [web]) {
      expect(source).toContain("callPurpose: z.enum(OUTBOUND_CALL_PURPOSES)");
      expect(source).not.toContain("callPurpose: z.enum(OUTBOUND_CALL_PURPOSES).optional()");
      expect(source).not.toContain('default("marketing_or_sales")');
      expect(source).toContain("callPurpose: effectiveCallPurpose");
      expect(source).toContain("requestedCallPurpose: callPurpose");
      expect(source).toContain("evaluateOutboundDialGate({");
      expect(source).toContain("outboundConsentMetadata({");
      expect(source).toContain("tcpaBlocked: true");
      expect(source).toContain("DUPLICATE_DIAL_SUPPRESSED");
      expect(source).toContain("OUTSIDE_PERMITTED_CALLING_HOURS");
    }

    expect(web).toContain("await inspectOutboundRecipientPermission({");
    expect(web).toContain("const effectiveCallPurpose = permission.effectiveCallPurpose");
    expect(mobile).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(mobile).not.toContain("placeOutboundCall");
    expect(read("src/lib/voice/openai-outbound-placement.ts")).toContain("lastCalledAt:");

    expect(gate).toContain("isDncBlocked(opts.userId, opts.phone)");
    expect(gate).toContain("isFederalDncListed(opts.phone)");
    expect(gate).toContain("is_marketing_call: isMarketingCall");
    expect(gate).toContain("resolveCallingHoursForPhone");
    expect(gate).toContain('reason: "outside_permitted_calling_hours"');
    expect(gate).toContain("const federalGate = assertFederalDncForMarketing()");
  });

  it("fails marketing outbound closed when Federal DNC credentials are missing", () => {
    const federal = read("src/lib/federal-dnc-service.ts");
    const gate = read("src/lib/outbound-dial-gate.ts");
    const readiness = read("src/lib/launch-readiness.ts");

    expect(federal).toContain('code: "FEDERAL_DNC_NOT_CONFIGURED"');
    expect(federal).toContain("allowed: false");
    expect(federal).toContain('source: "unconfigured"');
    expect(federal).toContain('return { listed: false, source: "unconfigured", checked_at }');
    expect(gate).toContain("const federalGate = assertFederalDncForMarketing()");
    expect(gate).toContain('reason: "federal_dnc_unconfigured"');
    expect(gate).toContain("isFederalDncListed(opts.phone)");
    expect(gate).toContain("isDncBlocked(opts.userId, opts.phone)");
    expect(gate).toContain("evaluateOutboundConsent");
    expect(readiness).toContain("deferred_checklist");
    expect(readiness).toContain("FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY");
  });

  it("keeps direct deny diagnostics masked and permitted-hour copy jurisdiction-neutral", () => {
    const web = read("src/routes/outbound-routes.ts");
    expect(web.match(/phoneSuffixForLog\(customerNumber\)/g)).toHaveLength(3);
    for (const path of [
      "src/routes/outbound-routes.ts",
      "src/routes/outbound-dial-atomic-routes.ts",
      "src/lib/outbound-dial-gate.ts",
    ])
      expect(read(path)).not.toContain("8am to 9pm");
  });

  it("keeps consent metadata durable and source-specific", () => {
    const purpose = read("src/lib/outbound-call-purpose.ts");
    const web = read("src/routes/outbound-routes.ts");
    const mobile = read("src/routes/mobile-routes.ts");

    expect(purpose).toContain('OUTBOUND_CONSENT_VERSION = "tcpa-v1"');
    expect(purpose).toContain("call_purpose: input.callPurpose");
    expect(purpose).toContain("client_requested_call_purpose");
    expect(purpose).toContain("consent_version: OUTBOUND_CONSENT_VERSION");
    expect(purpose).toContain("has_express_written_consent: normalizedExpressConsent(input)");
    expect(purpose).toContain("source: input.source");
    expect(purpose).not.toContain("normalizeOutboundCallPurpose");
    expect(web).toContain('source: "web"');
    expect(mobile).toContain("NATIVE_OUTBOUND_UNAVAILABLE");
    expect(mobile).not.toContain("outboundConsentMetadata");
  });

  it("keeps bulk and campaign dialing explicitly marketing-only", () => {
    const outbound = read("src/routes/outbound-routes.ts");
    const campaignDialer = read("src/services/campaign-dialer.ts");
    const dialGate = read("src/lib/outbound-dial-gate.ts");

    const bulkStart = outbound.indexOf('"/api/outbound/bulk"');
    const bulk = outbound.slice(bulkStart);
    expect(bulkStart).toBeGreaterThan(-1);
    expect(bulk).toContain('callPurpose: "marketing_or_sales"');
    expect(bulk).toContain('source: "bulk"');
    expect(bulk).toContain('code: "CONSENT_ARTIFACT_REQUIRED"');
    expect(bulk).toContain("if (has_express_written_consent)");
    expect(bulk).toContain("hasExpressWrittenConsent: false");
    expect(bulk).not.toContain("hasExpressWrittenConsent: !!has_express_written_consent");
    expect(bulk).not.toContain('event: "consent_source_captured"');
    expect(campaignDialer).toContain("evaluateOutboundDialGate");
    expect(campaignDialer).toContain("has_express_written_consent: false");
    expect(dialGate).toContain("is_marketing_call: isMarketingCall");
    expect(dialGate).toContain("hasExpressWrittenConsent");
    expect(campaignDialer).toContain('call_purpose: "marketing_or_sales"');
    expect(dialGate).toContain("isFederalDncListed");
    expect(campaignDialer).toContain('source: "campaign"');
  });

  it("documents required callPurpose in the public API contract", () => {
    const openapi = read("src/lib/openapi-spec.ts");

    expect(openapi).toContain('required: ["agentId", "customerNumber", "callPurpose"]');
    const spec = getOpenApiSpec();
    expect(spec.components.schemas.OutboundDialRequest.required).toEqual([
      "agentId",
      "customerNumber",
      "callPurpose",
      "requestKey",
      "consentArtifactId",
    ]);
    expect(spec.components.schemas.LegacyMobileOutboundDialRequest.required).toEqual([
      "agentId",
      "customerNumber",
      "callPurpose",
    ]);
    expect(spec.paths["/api/outbound/dial"].post?.responses["202"]).toBeDefined();
    expect(spec.paths["/api/outbound/dial"].post?.responses["503"]).toBeDefined();
    expect(openapi).toContain('"/api/outbound/dial/{requestKey}"');
    expect(openapi).toContain('"/api/outbound/dial/{requestKey}/cancel-missing"');
    const native = spec.paths["/api/mobile/calls/outbound"].post!;
    expect(native.requestBody).toBeUndefined();
    expect(native.responses["200"]).toBeUndefined();
    expect(native.responses["503"]).toBeDefined();
    expect(native.description).toContain("independently of general web outbound activation");
    expect(openapi).toContain('"/api/outbound/dial"');
    expect(openapi).toContain('"/api/mobile/calls/outbound"');
    expect(openapi).toContain("DNC or TCPA consent gate blocked the call.");
    expect(native.description).toContain("Client consent assertions cannot authorize calls");
    expect(native.description).toContain(
      "signed-permission, stable-request and uncertain-outcome recovery",
    );
  });
});
