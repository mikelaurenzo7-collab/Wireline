import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI/Vapi-only demo architecture", () => {
  it("keeps OpenAI as the managed structured default", () => {
    const models = read("src/lib/ai-models.ts");
    expect(models).toContain("STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(models).not.toContain("STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL");
  });

  it("routes the generic live-voice API to OpenAI Realtime", () => {
    const routes = read("src/routes/grok-voice-routes.ts");
    expect(routes).toContain("createOpenAILiveVoiceCall");
    expect(routes).toContain("getOpenAILiveVoiceStatus");
    expect(routes).not.toContain("createGrokVoiceClientSession");
    expect(routes).not.toContain("getGrokVoiceStatus");
  });

  it("uses WebRTC in Studio and never the xAI client-secret protocol", () => {
    const entry = read("src/components/LiveVoiceSandbox.tsx");
    const sandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    expect(entry).toContain("OpenAILiveVoiceSandbox");
    expect(sandbox).toContain("new RTCPeerConnection()");
    expect(sandbox).toContain("/api/voice/live/session");
    expect(sandbox).not.toContain("xai-client-secret");
    expect(sandbox).not.toContain("api.x.ai");
  });

  it("keeps phone demos on Vapi and removes xAI-specific profile writes", () => {
    const service = read("src/lib/voice/openai-live-agent-service.ts");
    const profiles = read("src/routes/grok-live-profile-routes.ts");
    expect(service).toContain('phoneDemoProvider: "vapi"');
    expect(profiles).toContain("Vapi voice library");
    expect(profiles).not.toContain("grokVoiceId");
  });

  it("marks the old Grok demo contract as retired", () => {
    const metadata = read("src/lib/grok-features.ts");
    const docs = read("docs/GROK_LIVE_VOICE.md");
    expect(metadata).toContain("enabled: false");
    expect(docs).toContain("retired from demo routing");
  });
});
