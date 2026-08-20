import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI browser + native xAI PSTN voice architecture", () => {
  it("keeps OpenAI GPT-5.6 Terra as the managed structured default", () => {
    const models = read("src/lib/ai-models.ts");
    expect(models).toContain("STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL");
  });

  it("routes Studio live tests through OpenAI Realtime WebRTC", () => {
    const routes = read("src/routes/grok-voice-routes.ts");
    const entry = read("src/components/LiveVoiceSandbox.tsx");
    const sandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    expect(routes).toContain("createOpenAILiveVoiceCall");
    expect(routes).toContain("xaiOutboundRouter");
    expect(routes).not.toContain("createGrokVoiceClientSession");
    expect(entry).toContain('from "./OpenAILiveVoiceSandbox"');
    expect(sandbox).toContain("/api/voice/live/session");
    expect(sandbox).toContain("new RTCPeerConnection()");
    expect(sandbox).not.toContain("xai-client-secret.");
  });

  it("keeps ChatGPT private simulation on OpenAI Realtime WebRTC", () => {
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");
    const widgetMeta = read("src/lib/mcp-app-metadata.ts");
    const widget = read("src/lib/chatgpt-mcp-account.ts");
    expect(accountRoutes).toContain("createOpenAIRealtimeClientSecret");
    expect(widgetMeta).toContain('connectDomains: ["https://api.openai.com"]');
    expect(widget).toContain("new RTCPeerConnection()");
    expect(widget).not.toContain("xai-client-secret.");
  });

  it("keeps custom browser voices unsupported and phone customization documented", () => {
    const profiles = read("src/routes/grok-live-profile-routes.ts");
    expect(profiles).toContain("Vapi-supported streaming voice-library workflow");
    expect(profiles).not.toContain("grokVoiceId");
  });

  it("pins native Speech-to-Speech instead of the experimental unversioned demo path", () => {
    const metadata = read("src/lib/grok-features.ts");
    const docs = read("docs/GROK_LIVE_VOICE.md");
    expect(metadata).toContain("enabled: false");
    expect(docs).toContain("native Twilio + xAI Speech-to-Speech");
    expect(docs).toContain("grok-voice-think-fast-2.0");
  });

  it("signals OpenAI Realtime with ephemeral client secret + application/sdp", () => {
    const service = read("src/lib/voice/openai-live-agent-service.ts");
    expect(service).toContain("realtime/client_secrets");
    expect(service).toContain('"Content-Type": "application/sdp"');
    expect(service).not.toContain("new FormData()");
  });

  it("does not advertise tools on the generic OpenAI session mint", () => {
    const routes = read("src/routes/openai-realtime-routes.ts");
    const mint = routes.slice(routes.indexOf('"/api/voice/openai/session"'));
    expect(mint).toContain("tools: []");
    expect(mint).toContain('toolChoice: "none"');
  });
});
