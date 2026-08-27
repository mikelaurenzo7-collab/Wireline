import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("xAI outbound attempt correlation", () => {
  it("mints the carrier token from the placement returned by the locked claim", () => {
    const service = read("src/lib/voice/outbound-call-service.ts");
    expect(service).toContain("const { lead, created, placementId } = claim;");
    expect(service).toContain("issueXAIOutboundToken({ leadId: lead.id, placementId })");
  });

  it("checks placement ownership before bridge replay and status mutation", () => {
    const routes = read("src/routes/xai-outbound-routes.ts");
    const bridge = routes.slice(
      routes.indexOf("async function resolveBridgeContext("),
      routes.indexOf('router.post(\n  "/api/twilio-webhook/xai-outbound-bridge"'),
    );
    expect(
      bridge.indexOf("xaiOutboundPlacementMatches(nativeVoice, verification.claims)"),
    ).toBeGreaterThan(-1);
    expect(
      bridge.indexOf("xaiOutboundPlacementMatches(nativeVoice, verification.claims)"),
    ).toBeLessThan(bridge.indexOf("resolveXAIOutboundTwiMLReplay"));

    const status = routes.slice(
      routes.indexOf('"/api/twilio-webhook/xai-outbound-status"'),
      routes.indexOf("export default router"),
    );
    expect(status).toContain("xaiOutboundPlacementMatches(nativeVoice, verification.claims)");
    expect(
      status.indexOf("xaiOutboundPlacementMatches(nativeVoice, verification.claims)"),
    ).toBeLessThan(status.indexOf("const previousCarrierStatus"));
  });

  it("checks the same placement under the lead lock before xAI SIP attachment", () => {
    const routes = read("src/routes/xai-voice-routes.ts");
    const resolver = routes.slice(
      routes.indexOf("async function resolveOutboundSession("),
      routes.indexOf('router.post(\n  "/api/webhooks/xai/voice"'),
    );
    expect(resolver).toContain("pg_advisory_xact_lock");
    expect(resolver).toContain("xaiOutboundPlacementMatches(nativeVoice, verification.claims)");
    expect(
      resolver.indexOf("xaiOutboundPlacementMatches(nativeVoice, verification.claims)"),
    ).toBeLessThan(resolver.indexOf("const [attached]"));
  });
});
