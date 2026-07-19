import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/runtime-integrations-registry.ts"),
  "utf8",
);

describe("runtime integrations registry launch policy", () => {
  it("presents OpenAI as required primary and xAI as optional", () => {
    expect(source).toContain('"openai",\n    "OpenAI",');
    expect(source).toContain("Primary structured runtime, primary Vapi PSTN call model");
    expect(source).toContain('"xai",\n    "xAI Grok",');
    expect(source).toContain("excluded from the launch default chain");
    expect(source).toContain("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true");
  });

  it("marks the monetized communications control plane as required", () => {
    for (const integration of ["vapi", "twilio", "stripe", "resend", "upstash"]) {
      const start = source.indexOf(`item("${integration}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + 500)).toContain("true");
    }
  });

  it("keeps WhatsApp and ElevenLabs claims bounded", () => {
    expect(source).toContain("WhatsApp remains private beta");
    expect(source).toContain("Paid plan entitlements are required for Voice Library API use");
  });
});
