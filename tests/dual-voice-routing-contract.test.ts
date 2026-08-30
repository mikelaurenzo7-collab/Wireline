import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("OpenAI Realtime voice routing contracts", () => {
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

  it("rewrites owned Twilio numbers onto the OpenAI inbound webhook", () => {
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const carrier = read("src/lib/voice/native-phone-carrier.ts");
    const routing = read("src/routes/native-phone-routing-routes.ts");
    const canary = read("src/lib/demo-line-canary.ts");
    expect(assignment).toContain("configureNativeNumberRouting");
    expect(carrier).toContain("repairOwnedTwilioOpenAIRouting");
    expect(carrier).toContain("/api/twilio-webhook/openai-inbound");
    expect(carrier).toContain("/api/twilio-webhook/openai-inbound-fallback");
    expect(routing).toContain("repairOwnedTwilioOpenAIRouting");
    expect(routing).toContain("runInBackground(`openai inbound routing repair ${req.user.id}`");
    expect(canary).toContain("repairShowcaseOpenAIInboundRouting");
    expect(canary).toContain("configureNativeNumberRouting");
  });

  it("routes every PSTN call through the governed OpenAI runtime", () => {
    const policy = read("src/lib/voice/runtime-policy.ts");
    const runtime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const inbound = read("src/routes/openai-inbound-twilio-routes.ts");
    const webhook = read("src/routes/openai-sip-routes.ts");
    expect(policy).toContain('runtime: "openai_realtime"');
    expect(policy).toContain('phoneTransport: "openai_sip"');
    expect(policy).toContain('carrier: "twilio"');
    expect(policy).toContain("fallbackRuntime: null");
    expect(runtime).toContain("buildOpenAIRealtimeAgentRuntime");
    expect(runtime).toContain('runtime.agent.voiceProvider?.toLowerCase() === "presenter"');
    expect(runtime).toContain("runtime.agent.phoneVoiceId");
    expect(runtime).toContain("normalizeOpenAIRealtimeVoice");
    expect(inbound).toContain('"/api/twilio-webhook/openai-inbound"');
    expect(webhook).toContain('"/api/webhooks/openai/realtime"');
    expect(webhook).toContain("applyInboundAdmission");
    expect(webhook).toContain("acquireAccountOperationLease");
    expect(webhook).toContain("reserveRealtimeSessionSpend");
    expect(webhook).toContain("commitRealtimeSessionSpend");
    expect(webhook).toContain("releaseRealtimeSessionSpendAfterFailure");
    const admission = webhook.indexOf("applyInboundAdmission(");
    const lease = webhook.indexOf("await acquireAccountOperationLease(");
    const reserve = webhook.indexOf("await reserveRealtimeSessionSpend(");
    const accept = webhook.indexOf("await acceptCall(");
    expect(admission).toBeGreaterThan(-1);
    expect(lease).toBeGreaterThan(admission);
    expect(reserve).toBeGreaterThan(lease);
    expect(accept).toBeGreaterThan(reserve);
    expect(`${policy}\n${runtime}\n${inbound}\n${webhook}`).not.toMatch(/api\.vapi\.ai|api\.x\.ai/i);
  });

  it("routes Studio phone picks through the managed voice PATCH", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("/voice");
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
    expect(picker).toContain("voice.provider");
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

  it("documents only OpenAI for managed live voice", () => {
    const envExample = read(".env.example");
    expect(envExample).toContain("OPENAI_PROJECT_ID=");
    expect(envExample).toContain("OPENAI_WEBHOOK_SECRET=");
    expect(envExample).toContain("OPENAI_SIP_MAX_CALL_SECONDS=");
    expect(envExample).not.toMatch(/XAI_API_KEY|VAPI_PRIVATE_KEY|GROK/i);
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
