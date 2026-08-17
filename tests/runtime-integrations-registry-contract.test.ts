import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/runtime-integrations-registry.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const compactSource = source.replace(/\s+/g, " ");

describe("runtime integrations registry launch policy", () => {
  it("presents xAI as the optional-credential primary and OpenAI as required continuity", () => {
    expect(source).toContain('"openai",\n    "OpenAI",');
    expect(source).toContain(
      "Continuity structured runtime, Vapi PSTN fallback, and optional Realtime voice.",
    );
    expect(source).toContain('"xai",\n    "xAI Grok",');
    expect(source).toContain(
      "Grok 4.6 structured primary and Vapi PSTN Grok 4.3 plus xAI voices, plus preview TTS.",
    );
    expect(source).toContain("OpenAI remains continuity and Realtime");
    expect(source).toContain("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK");
    expect(compactSource).toMatch(/item\(\s*"openai".{0,500}?, true,/);
    expect(compactSource).toMatch(/item\(\s*"xai".{0,500}?, false,/);
  });

  it("marks the monetized communications control plane as required", () => {
    for (const integration of ["vapi", "twilio", "stripe", "resend", "upstash"]) {
      expect(compactSource).toMatch(new RegExp(`item\\(\\s*"${integration}".{0,700}?, true,`));
    }
  });

  it("reports signed Resend feedback separately from the required send transport", () => {
    expect(compactSource).toContain('"resend-feedback", "Resend delivery feedback",');
    expect(source).toContain("RESEND_WEBHOOK_SECRET");
    expect(compactSource).toMatch(/item\(\s*"resend-feedback".{0,700}?, false,/);
    expect(source).toContain("validate: resendWebhookSecretConfigured");
    expect(source).toContain(
      "Email sending remains available, but provider delivery risk and failure evidence are incomplete.",
    );
  });

  it("treats whitespace-only environment values as missing", () => {
    expect(source).toContain('typeof value === "string" && value.trim().length > 0');
  });

  it("keeps WhatsApp claims bounded", () => {
    expect(source).toContain("WhatsApp remains private beta");
  });
});
