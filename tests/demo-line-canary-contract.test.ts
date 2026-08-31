import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("founder showcase PSTN retirement", () => {
  const canary = read("src/lib/demo-line-canary.ts");
  const seed = read("src/lib/founder-showcase-seed.ts");

  it("does not probe, repair, or alert on retired founder numbers", () => {
    expect(canary).toContain('FOUNDER_SHOWCASE_PSTN_STATUS = "retired"');
    expect(canary).toContain("skipped: true");
    expect(canary).toContain('customerVoiceRuntime: "openai_realtime_twilio"');
    expect(canary).not.toContain("getTwilioClient");
    expect(canary).not.toContain("configureNativeNumberRouting");
    expect(canary).not.toContain("sendEmail");
    expect(canary).not.toContain("api.vapi.ai");
  });

  it("keeps browser-demo Bots on OpenAI without recreating PSTN metadata", () => {
    expect(seed).toContain('voiceProvider: "openai"');
    expect(seed).toContain('phoneVoiceProvider: "openai"');
    expect(seed).toContain('founder_pstn_status: "retired"');
    expect(seed).not.toContain("public_phone_number: agent.tel");
  });
});
