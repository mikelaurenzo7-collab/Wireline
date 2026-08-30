import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor readiness contract", () => {
  const probe = read("scripts/check-vendor-readiness.mjs");

  it("probes launch-critical providers without billable inference, calls, or messages", () => {
    for (const id of [
      "postgres",
      "upstash",
      "openai",
      "ai_gateway",
      "twilio_voice_sms",
      "stripe",
      "agentmail",
      "resend",
      "elevenlabs",
      "federal_dnc",
    ]) {
      expect(probe).toContain(`"${id}"`);
    }
    expect(probe).toContain("/v1/models");
    expect(probe).toContain('openaiModelIds.has("gpt-realtime-2.1")');
    expect(probe).toContain('present("OPENAI_PROJECT_ID")');
    expect(probe).toContain('present("OPENAI_WEBHOOK_SECRET")');
    expect(probe).toContain("/IncomingPhoneNumbers.json?PageSize=50");
    expect(probe).toContain("this probe uses read-only GET requests only");
    expect(probe).not.toMatch(/api\.vapi\.ai|api\.x\.ai|VAPI_|XAI_|grok/i);
    expect(probe).not.toContain('/call"');
    expect(probe).not.toContain("/Messages.json");
  });

  it("requires funding and complete Twilio-to-OpenAI routing", () => {
    expect(probe).toContain("twilioBalanceUsd > 0");
    expect(probe).toContain("openAIInboundNumbers.length === voiceCapableNumbers.length");
    expect(probe).toContain("/api/twilio-webhook/openai-inbound");
    expect(probe).toContain("stripeAvailable >= 0");
    expect(probe).toContain("No ONLINE Twilio WhatsApp sender found");
  });

  it("is an explicit owner command rather than a default local test", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["vendor:readiness"]).toBe("node scripts/check-vendor-readiness.mjs");
    expect(packageJson.scripts.verify).not.toContain("vendor:readiness");
  });
});
