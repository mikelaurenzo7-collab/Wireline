import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("OpenAI Realtime voice routing contracts", () => {
  it("makes every successful voice PATCH a one-way migration to canonical OpenAI voice", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain('requestedProvider !== "openai"');
    expect(routes).toContain("normalizeManagedOpenAIVoiceId(requestedVoiceId)");
    expect(routes).toContain("hasPhoneVoiceId");
    expect(routes).toContain("hasPhoneVoiceProvider");
    expect(routes).toContain('voiceProvider: "openai"');
    expect(routes).toContain("phoneVoiceId: null");
    expect(routes).toContain("phoneVoiceProvider: null");
    expect(routes).not.toContain("defaultPresenterPhoneVoicePayload");
    expect(routes).not.toContain(
      'if (provider === "presenter" || phoneVoiceId || phoneVoiceProviderRaw)',
    );
  });

  it("rewrites owned Twilio numbers onto the OpenAI inbound webhook", () => {
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const carrier = read("src/lib/voice/native-phone-carrier.ts");
    const routing = read("src/routes/native-phone-routing-routes.ts");
    expect(assignment).toContain("configureNativeNumberRouting");
    expect(carrier).toContain("repairOwnedTwilioOpenAIRouting");
    expect(carrier).toContain("export function isNativeNumberOpenAIRouted");
    expect(carrier).toContain("row.smsUrl === expected.smsUrl");
    expect(carrier).toContain("row.smsMethod === expected.smsMethod");
    expect(carrier).toContain("row.voiceUrl === expected.voiceUrl");
    expect(carrier).toContain("row.voiceMethod === expected.voiceMethod");
    expect(carrier).toContain("row.voiceFallbackUrl === expected.voiceFallbackUrl");
    expect(carrier).toContain("row.voiceFallbackMethod === expected.voiceFallbackMethod");
    expect(carrier).toContain("const updated = await client.incomingPhoneNumbers(sid).update");
    expect(carrier).toContain("if (!isNativeNumberOpenAIRouted(updated))");
    const repair = carrier.slice(
      carrier.indexOf("export async function repairOwnedTwilioOpenAIRouting"),
      carrier.indexOf("async function recoverAcceptedPurchase"),
    );
    expect(repair).not.toContain(".limit(20)");
    expect(repair).toContain("await Promise.all(workers)");
    expect(routing).toContain("await repairOwnedTwilioOpenAIRouting(req.user.id)");
    expect(routing).not.toContain("runInBackground(`openai inbound routing repair");
    expect(routing).toContain("routing.confirmedPhoneNumbers.has(row.phoneNumber)");
    expect(routing).toContain('"configuration_required"');
    expect(routing).toContain('"degraded"');
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
    expect(runtime).toContain("resolveOpenAIAgentVoiceSelection");
    expect(runtime).toContain('input.voiceProvider?.trim().toLowerCase() === "presenter"');
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
    expect(`${policy}\n${runtime}\n${inbound}\n${webhook}`).not.toMatch(
      /api\.vapi\.ai|api\.x\.ai/i,
    );
  });

  it("marks an outbound lead connected only inside its durable OpenAI call claim", () => {
    const bridge = read("src/routes/openai-outbound-routes.ts");
    const webhook = read("src/routes/openai-sip-routes.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    const placement = read("src/lib/voice/openai-outbound-placement.ts");
    const bridgeClaim = bridge.slice(
      bridge.indexOf('amdNativeVoice.state = "bridging"'),
      bridge.indexOf('return {\n      kind: "bridge"'),
    );
    const contextResolver = webhook.slice(
      webhook.indexOf("async function resolveOutboundContext"),
      webhook.indexOf("async function callControl"),
    );
    const durableClaim = session.slice(
      session.indexOf("async function claimOutboundLeadInTransaction"),
      session.indexOf("async function updatePresence"),
    );

    expect(bridgeClaim).toContain("status: LEAD_STATUS.DIALING");
    expect(bridgeClaim).not.toContain("status: LEAD_STATUS.CONNECTED");
    expect(contextResolver).not.toContain(".update(schema.outboundLeads)");
    expect(durableClaim).toContain("await claimOutboundLeadInTransaction(tx, input)");
    expect(durableClaim).toContain("status: LEAD_STATUS.CONNECTED");
    expect(durableClaim).toContain("input.outboundPlacementId");
    expect(durableClaim).toContain("currentCallId && currentCallId !== providerId");
    expect(durableClaim).toContain(".returning({ id: schema.outboundLeads.id })");
    expect(placement).toContain("outbound_line_number: input.outboundLineNumber");
    expect(bridge).toContain("eq(schema.phoneNumbers.phoneNumber, outboundLineNumber)");
    expect(contextResolver).toContain("eq(schema.phoneNumbers.phoneNumber, outboundLineNumber)");
    expect(durableClaim).toContain("eq(schema.phoneNumbers.phoneNumber, input.calledNumber)");
    expect(bridge).toContain('nativeVoice.state === "bridging" || nativeVoice.bridge_served_at');
    expect(bridge).toContain(
      'nextNativeVoice.state = "carrier_completed_without_openai_confirmation"',
    );
  });

  it("routes Studio phone picks through the managed voice PATCH", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    const selection = picker.slice(
      picker.indexOf("async function selectVoice"),
      picker.indexOf("function renderVoice"),
    );
    expect(picker).toContain("/voice");
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
    expect(picker).toContain("voice.provider");
    expect(selection).toContain('JSON.stringify({ voiceId: voice.id, provider: "openai" })');
    expect(selection).not.toContain("phoneVoiceId: voice.id");
    expect(selection).not.toContain("phoneVoiceProvider: voice.provider");
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
    expect(openaiConfig).toContain("parseOpenAIRealtimeVoice(OPENAI_REALTIME_DEFAULT_VOICE)");
    expect(openaiConfig).toContain('|| "marin"');
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
