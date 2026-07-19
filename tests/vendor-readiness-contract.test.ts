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
      "xai",
      "openai",
      "ai_gateway",
      "vapi",
      "twilio_voice_sms",
      "twilio_whatsapp",
      "stripe",
      "resend",
      "federal_dnc",
    ]) {
      expect(probe).toContain(`"${id}"`);
    }

    expect(probe).toContain("/v1/models");
    expect(probe).toContain("/phone-number?limit=100");
    expect(probe).toContain("/assistant?limit=1");
    expect(probe).toContain("/IncomingPhoneNumbers.json?PageSize=50");
    expect(probe).toContain("messaging.twilio.com/v1/Services?PageSize=50");
    expect(probe).toContain("/v1/Channels/Senders?Channel=whatsapp&PageSize=50");
    expect(probe).not.toContain('/call"');
    expect(probe).not.toContain("/chat/completions");
    expect(probe).not.toContain("/Messages.json");
  });

  it("blocks invalid funding or core inventory and keeps optional channels separate", () => {
    expect(probe).toContain("stripeAvailable >= 0");
    expect(probe).toContain("Twilio credentials missing or rejected");
    expect(probe).toContain("twilioBalanceUsd >= 0");
    expect(probe).toContain("balance_non_negative: twilioFunded");
    expect(probe).toContain("voiceCapableNumbers.length > 0");
    expect(probe).toContain("No ONLINE Twilio WhatsApp sender found");
    expect(probe).toContain('validHttpsUrl("FEDERAL_DNC_API_URL")');
    expect(probe).toContain('"elevenlabs",\n  false');
    expect(probe).toContain("usage top-ups do not unlock paid-plan entitlements");
  });

  it("is exposed as an explicit owner command rather than a default local test", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["vendor:readiness"]).toBe("node scripts/check-vendor-readiness.mjs");
    expect(packageJson.scripts.verify).not.toContain("vendor:readiness");
  });
});
