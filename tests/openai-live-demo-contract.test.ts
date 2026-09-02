import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OPENAI_REALTIME_VOICE_IDS } from "../src/lib/voice-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI browser and PSTN voice architecture", () => {
  it("routes Studio live tests through server-mediated Realtime WebRTC", () => {
    const routes = read("src/routes/live-voice-routes.ts");
    const sandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    expect(routes).toContain("createOpenAILiveVoiceCall");
    expect(routes).toContain("runOpenAILiveVoiceTool");
    expect(sandbox).toContain("/api/voice/live/session");
    expect(sandbox).toContain("new RTCPeerConnection()");
  });

  it("keeps ChatGPT account simulation on WebRTC while public voice endpoints stay retired", () => {
    const account = read("src/routes/chatgpt-mcp-account-routes.ts");
    const marketing = read("src/routes/marketing-runtime-routes.ts");
    expect(account).toContain("createOpenAIRealtimeSimulationCall");
    expect(marketing).toContain("publicVoicePreviewRetired");
    expect(marketing).toContain("res.status(410).json");
    expect(marketing).not.toContain("createPublicOpenAILiveDemoCall");
    expect(`${account}\n${marketing}`).not.toMatch(/api\.x\.ai|vapi/i);
  });

  it("bridges Twilio PSTN to the OpenAI project SIP endpoint", () => {
    const inbound = read("src/routes/openai-inbound-twilio-routes.ts");
    const config = read("src/lib/voice/openai-sip-config.ts");
    const sip = read("src/routes/openai-sip-routes.ts");
    expect(inbound).toContain('"/api/twilio-webhook/openai-inbound"');
    expect(inbound).toContain("evaluateTwilioWebhookAuth");
    expect(config).toContain("@sip.api.openai.com;transport=tls");
    expect(sip).toContain('"/api/webhooks/openai/realtime"');
    expect(sip).toContain("verifyStandardWebhook");
  });

  it("pins the certified model, transcriber, and official voice roster", () => {
    const config = read("src/lib/voice/openai-realtime-config.ts");
    expect(config).toContain("OPENAI_REALTIME_PRICING_MODEL");
    expect(config).toContain('"gpt-4o-mini-transcribe"');
    expect(config).toContain("OPENAI_REALTIME_VOICES = OPENAI_REALTIME_VOICE_IDS");
    expect(OPENAI_REALTIME_VOICE_IDS).toHaveLength(10);
    expect(new Set(OPENAI_REALTIME_VOICE_IDS).size).toBe(10);
  });
});
