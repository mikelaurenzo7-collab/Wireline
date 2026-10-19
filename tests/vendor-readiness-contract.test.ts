import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor readiness contract", () => {
  const probe = read("scripts/check-vendor-readiness.mjs");

  it("probes launch-critical providers without billable inference, calls, or messages", () => {
    for (const id of [
      "postgres",
      "voice_worker",
      "upstash",
      "openai",
      "xai",
      "xai_knowledge_index",
      "ai_gateway",
      "twilio_voice_sms",
      "stripe",
      "agentmail",
      "resend",
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
    // xAI is probed through read-only catalog and collection lists only: the
    // API key against /v1/models and the Management key against /v1/collections.
    expect(probe).toContain('readJson("https://api.x.ai/v1/models"');
    expect(probe).toContain('readJson("https://management-api.x.ai/v1/collections"');
    expect(probe).not.toMatch(/api\.x\.ai\/v1\/(responses|chat|tts|files|documents)/);
    expect(probe).not.toMatch(/api\.vapi\.ai|VAPI_|XAI_API_KEY_CHATKIT|XAI_SIP_ALLOWED_ADDRESSES/);
    expect(probe).not.toMatch(/generativelanguage|GEMINI_API_KEY/);
    expect(probe).not.toMatch(/elevenlabs|11labs/i);
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
