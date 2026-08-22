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
    expect(sandbox).toContain("session.maxDurationSeconds");
    expect(sandbox).not.toContain("xai-client-secret.");
  });

  it("keeps ChatGPT private simulation on OpenAI Realtime WebRTC", () => {
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");
    const widgetMeta = read("src/lib/mcp-app-metadata.ts");
    const widget = read("src/lib/chatgpt-mcp-account.ts");
    expect(accountRoutes).toContain("createOpenAIRealtimeSimulationCall");
    expect(accountRoutes).toContain("offer_sdp");
    expect(widgetMeta).toContain("connectDomains: []");
    expect(widgetMeta).toContain("connect_domains: []");
    expect(widget).toContain("new RTCPeerConnection()");
    expect(widget).toContain("offer_sdp: localSdp");
    expect(widget).toContain("session.maxDurationSeconds");
    expect(widget).not.toContain("https://api.openai.com/v1/realtime/calls");
    expect(widget).not.toContain("session.client_secret");
    expect(widget).not.toContain("xai-client-secret.");
  });

  it("keeps the public guest demo on server-mediated OpenAI WebRTC", () => {
    const routes = read("src/routes/marketing-runtime-routes.ts");
    const service = read("src/lib/voice/openai-public-demo-session.ts");
    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    expect(routes).toContain('"/api/public/demo-call"');
    expect(routes).toContain("createPublicOpenAILiveDemoCall");
    expect(service).toContain("OPENAI_REALTIME_DEFAULT_MODEL");
    expect(service).toContain("tools: []");
    expect(service).toContain('tool_choice: "none"');
    expect(service).toContain("runInBackground");
    expect(service).toContain("hangupOpenAIRealtimeCall");
    expect(hook).toContain("new RTCPeerConnection()");
    expect(hook).toContain("JSON.stringify({ sdp })");
    expect(hook).not.toContain("xai-client-secret");
    expect(hook).not.toContain("api.x.ai");
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
    const callControl = read("src/lib/voice/openai-realtime-call-control.ts");
    expect(service).toContain("createServerManagedOpenAIRealtimeCall");
    expect(service).toContain("OPENAI_LIVE_VOICE_MAX_SECONDS = 300");
    expect(service).toContain("runInBackground");
    expect(service).toContain("hangupOpenAIRealtimeCall");
    expect(callControl).toContain("realtime/client_secrets");
    expect(callControl).toContain('"Content-Type": "application/sdp"');
    expect(callControl).toContain("openai_realtime_hangup");
    expect(callControl).not.toContain("new FormData()");
  });

  it("keeps the generic OpenAI simulation tool-free and server-managed", () => {
    const routes = read("src/routes/openai-realtime-routes.ts");
    const mint = routes.slice(routes.indexOf('"/api/voice/openai/session"'));
    expect(mint).toContain("sdp: req.body.sdp");
    expect(mint).toContain("tools: []");
    expect(mint).toContain('toolChoice: "none"');
    expect(mint).toContain("createOpenAIRealtimeSimulationCall");
  });
});
