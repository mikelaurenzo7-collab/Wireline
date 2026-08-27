import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("dual-voice PSTN routing contracts", () => {
  it("preserves phone voice on presenter PATCH unless explicitly overridden", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("hasPhoneVoiceId");
    expect(routes).toContain("hasPhoneVoiceProvider");
    expect(routes).toContain("defaultPresenterPhoneVoicePayload");
    expect(routes).toContain('provider !== "presenter"');
    expect(routes).not.toContain(
      'if (provider === "presenter" || phoneVoiceId || phoneVoiceProviderRaw)',
    );
  });

  it("routes every PSTN call through the governed managed voice runtime", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const managedRuntime = read("src/lib/managed-voice-runtime.ts");
    expect(factory).toContain("buildManagedVoiceRuntime");
    expect(factory).toContain('schema.clonedVoices.status, "approved"');
    expect(factory).toContain("resolvePstnVoiceCandidate");
    expect(factory).not.toContain('voiceProvider === "presenter"');
    expect(managedRuntime).toContain("isManagedVapiVoiceId");
    expect(managedRuntime).toContain("DEFAULT_MANAGED_VOICE_ID");
    expect(managedRuntime).toContain('provider: "xai" as const');
    expect(managedRuntime).toContain('provider: "vapi" as const');
    expect(managedRuntime).toContain('provider: "11labs" as const');
    expect(managedRuntime).toContain("input.approvedClone === true");
    const roster = read("src/data/voice-roster.ts");
    const helper = roster.slice(roster.indexOf("export function resolvePstnVoiceCandidate"));
    expect(helper).toContain("if (isManagedVapiVoiceId(studioVoiceId)) return studioVoiceId;");
    expect(helper).toContain("if (isManagedVapiVoiceId(phoneVoiceId)) return phoneVoiceId;");
    // Native PSTN uses the xAI Speech-to-Speech roster, not Vapi candidate resolution.
    const nativeRuntime = read("src/lib/voice/xai-agent-runtime.ts");
    const grokConfig = read("src/lib/voice/grok-voice-config.ts");
    const client = read("src/lib/vapi-client.ts");
    expect(nativeRuntime).toContain("resolveWirelineGrokVoice");
    expect(grokConfig).toContain("WIRELINE_LIVE_VOICE_PROFILES");
    expect(client).toContain("placeNativeOutboundCall");
    expect(client).not.toContain("resolvePstnVoiceCandidate");
  });

  it("routes Studio phone picks through the managed voice PATCH", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("/voice");
    expect(picker).toContain('provider: "vapi"');
    expect(picker).not.toContain('provider: "presenter"');
  });
});

describe("ChatGPT private voice simulation routing", () => {
  it("starts the private voice simulation on OpenAI Realtime, not Grok", () => {
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");
    expect(accountRoutes).toContain(
      'import { createOpenAIRealtimeSimulationCall } from "../lib/voice/openai-realtime-service";',
    );
    expect(accountRoutes).not.toContain("createGrokVoiceClientSession");

    const simulationHandler = accountRoutes.slice(
      accountRoutes.indexOf('if (name === "start_private_voice_simulation")'),
      accountRoutes.indexOf('if (name === "list_wireline_agents")'),
    );
    expect(simulationHandler).toContain("createOpenAIRealtimeSimulationCall({");
    expect(simulationHandler).toContain("sdp: text(args.offer_sdp, 60_000)");
    expect(simulationHandler).toContain("instructions: draft.runtimeInstructions");
    expect(simulationHandler).toContain("agentName: draft.view.name");
    expect(simulationHandler).toContain("tools: []");
    expect(simulationHandler).toContain('toolChoice: "none"');
    expect(simulationHandler).toContain('apiKeyPurpose: "chatgpt_demo"');
  });

  it("keeps server-managed Realtime calls draft-ready and spend-isolated", () => {
    const openaiService = read("src/lib/voice/openai-realtime-service.ts");
    const callControl = read("src/lib/voice/openai-realtime-call-control.ts");
    const keyring = read("src/lib/voice/openai-realtime-keyring.ts");
    expect(openaiService).toContain("instructions?: string | null");
    expect(openaiService).toContain("agentName?: string | null");
    expect(openaiService).toContain("tools?: OpenAIRealtimeToolDefinition[]");
    expect(openaiService).toContain('toolChoice?: "auto" | "none"');
    expect(openaiService).toContain('apiKeyPurpose?: "runtime" | "chatgpt_demo"');
    expect(keyring).toContain("OPENAI_API_KEY_CHATKIT");
    expect(keyring).toContain('source === "chatgpt_demo"');
    expect(callControl).toContain("expectedKeyFingerprint");
    expect(callControl).toContain("keySource: key.source");
    expect(openaiService).toContain("createServerManagedOpenAIRealtimeCall");
    expect(openaiService).toContain("OPENAI_REALTIME_SIMULATION_MAX_SECONDS = 300");
    expect(openaiService).toContain("hangupOpenAIRealtimeCall");
    expect(openaiService).not.toContain("client_secret");
    expect(openaiService).toContain("rate: 24000");
    expect(openaiService).toContain('mode: "ga"');
    expect(openaiService).not.toContain('mode: "beta"');
  });

  it("fails a misconfigured default voice back to a supported GA voice", () => {
    const openaiConfig = read("src/lib/voice/openai-realtime-config.ts");
    expect(openaiConfig).toContain("supportedVoices.includes(configuredDefault)");
    expect(openaiConfig).toContain(': "marin";');
  });

  it("keeps OPENAI_API_KEY_CHATKIT documented alongside OPENAI_API_KEY", () => {
    const envExample = read(".env.example");
    const openaiIndex = envExample.indexOf("OPENAI_API_KEY=");
    const chatkitIndex = envExample.indexOf("OPENAI_API_KEY_CHATKIT=");
    expect(openaiIndex).toBeGreaterThan(-1);
    expect(chatkitIndex).toBeGreaterThan(openaiIndex);
  });

  it("uses one XAI_API_KEY for chat, preview TTS, Studio, and native PSTN", () => {
    const envExample = read(".env.example");
    expect(envExample).toContain("XAI_API_KEY=");
    expect(envExample).toContain("XAI_API_KEY_CHATKIT=");
    expect(envExample).toContain("XAI_SIP_ALLOWED_ADDRESSES=");
    expect(envExample).not.toContain("XAI_API_KEY_VOICE=");
    expect(envExample).toContain("Wireline does not require a second env");
    expect(envExample).toContain("var for chat vs voice");
    expect(envExample).toContain("Latency is per model and endpoint, not");
    expect(envExample).toContain("Rate limits are per xAI team and model");
    expect(envExample).toContain("Do not add XAI_API_KEY_VOICE");
    expect(envExample).toContain("Native Twilio SIP Speech-to-Speech");
    expect(envExample).not.toContain(
      "Live PSTN Grok 4.3 + xAI Eve/Ara/Rex/Sal/Leo use VAPI_PRIVATE_KEY",
    );
  });

  it("signals account MCP WebRTC through the authenticated server", () => {
    const widget = read("src/lib/chatgpt-mcp-account.ts");
    const widgetMeta = read("src/lib/mcp-app-metadata.ts");

    expect(widget).toContain("new RTCPeerConnection()");
    expect(widget).toContain("offer_sdp: localSdp");
    expect(widget).toContain("session.sdp");
    expect(widget).toContain("session.maxDurationSeconds");
    expect(widget).not.toContain("https://api.openai.com/v1/realtime/calls");
    expect(widget).not.toContain('Authorization: "Bearer "');
    expect(widget).not.toContain("xai-client-secret.");
    expect(widget).not.toContain("api.x.ai");
    expect(widget).not.toContain("input_audio_buffer.append");

    expect(widgetMeta).toContain("connectDomains: []");
    expect(widgetMeta).toContain("connect_domains: []");
    expect(widgetMeta).not.toContain('connectDomains: ["https://api.x.ai", "wss://api.x.ai"]');
  });
});
