import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("dual-voice PSTN routing contracts", () => {
  it("preserves phone voice on presenter PATCH unless explicitly overridden", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("hasPhoneVoiceId");
    expect(routes).toContain("hasPhoneVoiceProvider");
    expect(routes).toContain("defaultPresenterPhoneVoicePayload");
    expect(routes).toContain('provider !== "presenter"');
    expect(routes).not.toContain(
      'if (provider === "presenter" || phoneVoiceId || phoneVoiceProviderRaw)',
    );
  });

  it("clamps every PSTN call to a curated managed Vapi voice", () => {
    // The managed runtime replaced per-provider PSTN substitution: the factory
    // accepts only curated Vapi voice ids and falls back to the managed default.
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(factory).toContain("isManagedVapiVoiceId");
    expect(factory).toContain("DEFAULT_MANAGED_VOICE_ID");
    expect(factory).toContain('provider: "vapi" as const');
    expect(factory).not.toContain("configured.phoneVoiceId");
    expect(factory).not.toContain('voiceProvider === "presenter"');
  });

  it("routes Studio phone picks through the managed voice PATCH", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("/voice");
    expect(picker).toContain('provider: "vapi"');
    expect(picker).not.toContain('provider: "presenter"');
  });
});
