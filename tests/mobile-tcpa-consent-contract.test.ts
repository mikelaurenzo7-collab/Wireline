import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mobile TCPA consent contract", () => {
  it("sends the web confirmation fields on Android outbound dial", () => {
    const api = read("android/app/src/main/java/com/wireline/app/data/WirelineApi.kt");
    const studio = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
    const ask = read("android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt");
    expect(api).toContain('put("permissionConfirmed", permissionConfirmed)');
    expect(api).toContain('put("nonsalesConfirmed", nonsalesConfirmed)');
    expect(api).toContain('put("salesAttestationConfirmed", salesAttestationConfirmed)');
    expect(api).toContain('put("callPurpose", callPurpose)');
    expect(api).not.toContain("hasExpressWrittenConsent");
    expect(studio).toContain("OutboundConsentCopy.PERMISSION");
    expect(studio).toContain("OutboundConsentCopy.NONSALES");
    expect(studio).toContain("OutboundPurposeCopy.APPOINTMENT");
    expect(studio).toContain("OutboundPurposeCopy.CALLBACK");
    expect(studio).toContain("OutboundPurposeCopy.SALES");
    expect(studio).not.toContain("marketing_or_sales");
    expect(studio).not.toContain("service_or_requested");
    expect(ask).toContain("permissionConfirmed");
    expect(ask).toContain("nonsalesConfirmed");
    expect(ask).toContain("OutboundPurposeCopy.CALLBACK");
  });

  it("sends the web confirmation fields on iOS outbound dial", () => {
    const api = read("ios/Wireline/Networking/WirelineAPI.swift");
    const view = read("ios/Wireline/Views/OutboundCallView.swift");
    const copy = read("ios/Wireline/OutboundConsentCopy.swift");
    expect(api).toContain("permissionConfirmed: Bool");
    expect(api).toContain("nonsalesConfirmed: Bool");
    expect(api).toContain("salesAttestationConfirmed: Bool");
    expect(api).toContain("callPurpose");
    expect(api).not.toContain("hasExpressWrittenConsent");
    expect(view).toContain("permissionConfirmed");
    expect(view).toContain("nonsalesConfirmed");
    expect(view).toContain("OutboundPurposeCopy.appointment");
    expect(view).toContain("OutboundPurposeCopy.callback");
    expect(view).toContain("OutboundPurposeCopy.sales");
    expect(view).not.toContain("marketing_or_sales");
    expect(view).not.toContain("service_or_requested");
    expect(view).not.toContain("express written consent");
    expect(copy).toContain("permission to contact");
    expect(copy).toContain("This isn't selling anything.");
  });

  it("does not attest permission from Siri or CarPlay", () => {
    const siri = read("ios/Wireline/Intents/CallAgentIntent.swift");
    const carplay = read("ios/Wireline/CarPlay/CarPlaySceneDelegate.swift");

    expect(siri).toContain('callPurpose: "appointment_service"');
    expect(siri).toContain("permissionConfirmed: false");
    expect(siri).toContain("nonsalesConfirmed: false");
    expect(siri).not.toContain("permissionConfirmed: true");
    expect(siri).not.toContain("hasExpressWrittenConsent");
    expect(carplay).toContain('callPurpose: "callback"');
    expect(carplay).toContain("permissionConfirmed: false");
    expect(carplay).toContain("nonsalesConfirmed: false");
    expect(carplay).not.toContain("permissionConfirmed: true");
    expect(carplay).not.toContain("hasExpressWrittenConsent");
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
