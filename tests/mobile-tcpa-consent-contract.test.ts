import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mobile TCPA consent contract", () => {
  it("requires hasExpressWrittenConsent on Android outbound dial", () => {
    const api = read("android/app/src/main/java/com/wireline/app/data/WirelineApi.kt");
    const studio = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
    const ask = read("android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt");
    expect(api).toContain("hasExpressWrittenConsent");
    expect(api).toContain("callPurpose");
    expect(studio).toMatch(/consentConfirmed/);
    expect(studio).toContain("marketing_or_sales");
    expect(studio).toContain("service_or_requested");
    expect(ask).toContain('val requiresConsent = purpose == "marketing_or_sales"');
    expect(ask).toContain("requiresConsent && consent");
    expect(ask).toContain("(!requiresConsent || consent)");
    expect(ask).toContain("callback");
  });

  it("requires hasExpressWrittenConsent on iOS outbound dial", () => {
    const api = read("ios/Wireline/Networking/WirelineAPI.swift");
    const view = read("ios/Wireline/Views/OutboundCallView.swift");
    const copy = read("ios/Wireline/OutboundConsentCopy.swift");
    expect(api).toContain("hasExpressWrittenConsent");
    expect(api).toContain("callPurpose");
    expect(view).toMatch(/consentConfirmed/);
    expect(view).toContain("marketing_or_sales");
    expect(view).toContain("service_or_requested");
    expect(copy).toContain("permission to contact");
  });

  it("does not hardcode express written consent for Siri or CarPlay callbacks", () => {
    const siri = read("ios/Wireline/Intents/CallAgentIntent.swift");
    const carplay = read("ios/Wireline/CarPlay/CarPlaySceneDelegate.swift");

    expect(siri).toContain('callPurpose: "service_or_requested"');
    expect(siri).toContain("hasExpressWrittenConsent: false");
    expect(siri).not.toContain("hasExpressWrittenConsent: true");
    expect(carplay).toContain('callPurpose: "callback"');
    expect(carplay).toContain("hasExpressWrittenConsent: false");
    expect(carplay).not.toContain("hasExpressWrittenConsent: true");
  });

  it("loads agent roles from mobile API on iOS create sheet", () => {
    const api = read("ios/Wireline/Networking/WirelineAPI.swift");
    const view = read("ios/Wireline/Views/AssistantLibraryView.swift");
    expect(api).toContain("/api/mobile/agents/roles");
    expect(view).toContain("agentRoles");
  });

  it("keeps native outbound independently closed before any mutation", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const route = mobile.slice(
      mobile.indexOf('"/api/mobile/calls/outbound"'),
      mobile.indexOf("// ── GET /api/mobile/calls/active"),
    );
    expect(route).toContain("authenticateUser");
    expect(route).toContain("mobileSensitiveRateLimiter");
    expect(route).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(mobile).not.toMatch(
      /placeOutboundCall|outboundDialReservations|hasExpressWrittenConsent/,
    );
    expect(route).not.toMatch(/BOTBOUND_GENERAL_OUTBOUND_ENABLED|\.insert\(|\.update\(|\.delete\(/);
  });
});
