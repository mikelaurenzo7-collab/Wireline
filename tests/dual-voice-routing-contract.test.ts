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

  it("clamps every PSTN call to a curated managed Vapi voice", () => {
    // The managed runtime replaced per-provider PSTN substitution: the factory
    // accepts only curated Vapi voice ids and falls back to the managed
    // default. Presenter/live-voice agents' dedicated phone pick
    // (agents.phone_voice_id) participates via resolvePstnVoiceCandidate,
    // which itself only passes MANAGED ids through — so the clamp invariant
    // holds while the UI-promised phone voice actually reaches the call
    // (previously it was stored and surfaced but never read at dial time).
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(factory).toContain("isManagedVapiVoiceId");
    expect(factory).toContain("DEFAULT_MANAGED_VOICE_ID");
    expect(factory).toContain('provider: "vapi" as const');
    expect(factory).toContain("resolvePstnVoiceCandidate");
    expect(factory).not.toContain('voiceProvider === "presenter"');
    const roster = read("src/data/voice-roster.ts");
    const helper = roster.slice(roster.indexOf("export function resolvePstnVoiceCandidate"));
    expect(helper).toContain("if (isManagedVapiVoiceId(studioVoiceId)) return studioVoiceId;");
    expect(helper).toContain("if (isManagedVapiVoiceId(phoneVoiceId)) return phoneVoiceId;");
    // The outbound client applies the same candidate resolution.
    const client = read("src/lib/vapi-client.ts");
    expect(client).toContain("resolvePstnVoiceCandidate");
  });

  it("routes Studio phone picks through the managed voice PATCH", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("/voice");
    expect(picker).toContain('provider: "vapi"');
    expect(picker).not.toContain('provider: "presenter"');
  });
});

describe("ChatGPT private voice simulation routing", () => {
  it("starts the private voice simulation on the managed Grok contract, not OpenAI", () => {
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");
    expect(accountRoutes).toContain(
      'import { createGrokVoiceClientSession } from "../lib/voice/grok-voice-service";',
    );
    expect(accountRoutes).not.toContain("createOpenAIRealtimeClientSecret");

    const simulationHandler = accountRoutes.slice(
      accountRoutes.indexOf('if (name === "start_private_voice_simulation")'),
      accountRoutes.indexOf('if (name === "list_wireline_agents")'),
    );
    expect(simulationHandler).toContain("createGrokVoiceClientSession({");
    expect(simulationHandler).toContain("instructions: draft.runtimeInstructions");
    expect(simulationHandler).toContain("agentName: draft.view.name");
    expect(simulationHandler).toContain("tools: []");
    expect(simulationHandler).toContain('toolChoice: "none"');
    expect(simulationHandler).toContain('apiKeyPurpose: "chatgpt_demo"');
  });

  it("gives createGrokVoiceClientSession a draft-mode input shape that mirrors the OpenAI realtime service", () => {
    const grokService = read("src/lib/voice/grok-voice-service.ts");
    expect(grokService).toContain("instructions?: string | null");
    expect(grokService).toContain("agentName?: string | null");
    expect(grokService).toContain("tools?: readonly GrokRealtimeFunction[]");
    expect(grokService).toContain('toolChoice?: "auto" | "none"');
    expect(grokService).toContain('apiKeyPurpose?: "runtime" | "chatgpt_demo"');

    // Draft (not-yet-persisted) ChatGPT agents must bypass the persisted-agent lookup.
    expect(grokService).toContain("const isDraftSession = Boolean(");
    expect(grokService).toContain(
      "const runtime = isDraftSession ? null : await loadAgentRuntime(input.agentId, input.userId);",
    );

    // Spend-isolated xAI key, mirroring OPENAI_API_KEY_CHATKIT.
    expect(grokService).toContain("XAI_API_KEY_CHATKIT");
    expect(grokService).toContain('purpose === "chatgpt_demo" ? process.env.XAI_API_KEY_CHATKIT');
  });

  it("keeps XAI_API_KEY_CHATKIT documented alongside XAI_API_KEY", () => {
    const envExample = read(".env.example");
    const xaiIndex = envExample.indexOf("XAI_API_KEY=");
    const chatkitIndex = envExample.indexOf("XAI_API_KEY_CHATKIT=");
    expect(xaiIndex).toBeGreaterThan(-1);
    expect(chatkitIndex).toBeGreaterThan(xaiIndex);
    expect(chatkitIndex - xaiIndex).toBeLessThan(200);
  });

  it("connects the account MCP widget to Grok WebSocket PCM, not OpenAI WebRTC", () => {
    const widget = read("src/lib/chatgpt-mcp-account.ts");
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");

    expect(widget).toContain("new WebSocket");
    expect(widget).toContain("xai-client-secret.");
    expect(widget).toContain('type: "session.update"');
    expect(widget).toContain("session.endpoint");
    expect(widget).toContain("input_audio_buffer.append");
    expect(widget).not.toContain("api.openai.com/v1/realtime/calls");
    expect(widget).not.toContain("RTCPeerConnection");

    expect(accountRoutes).toContain('connectDomains: ["https://api.x.ai", "wss://api.x.ai"]');
    expect(accountRoutes).not.toContain('connectDomains: ["https://api.openai.com"]');
  });
});
