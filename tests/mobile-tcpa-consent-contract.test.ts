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
    expect(studio).toMatch(/consentConfirmed/);
    expect(ask).toMatch(/outboundConsent/);
  });

  it("requires hasExpressWrittenConsent on iOS outbound dial", () => {
    const api = read("ios/Wireline/Networking/WirelineAPI.swift");
    const view = read("ios/Wireline/Views/OutboundCallView.swift");
    expect(api).toContain("hasExpressWrittenConsent");
    expect(view).toMatch(/consentConfirmed/);
  });

  it("server mobile outbound schema accepts consent flag", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    expect(mobile).toContain("hasExpressWrittenConsent");
    expect(mobile).toContain("evaluateOutboundConsent");
  });
});
