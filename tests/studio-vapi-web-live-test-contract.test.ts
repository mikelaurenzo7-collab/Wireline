import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Studio live tests use authenticated OpenAI Realtime without changing PSTN", () => {
  it("defaults Studio to authenticated OpenAI WebRTC", () => {
    const sandbox = read("src/components/LiveVoiceSandbox.tsx");
    const live = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const routes = read("src/routes/grok-voice-routes.ts");
    const status = read("src/lib/voice/openai-live-agent-service.ts");

    expect(sandbox).toContain('from "./OpenAILiveVoiceSandbox"');
    expect(live).toContain("/api/voice/live/session");
    expect(live).toContain("new RTCPeerConnection()");
    expect(live).not.toContain("xai-client-secret.");
    expect(routes).toContain("createOpenAILiveVoiceCall");
    expect(routes).toContain('"/api/voice/live/session"');
    expect(routes).not.toContain('"/api/voice/live/web-session"');
    expect(routes).not.toContain("createGrokVoiceClientSession");
    expect(status).toContain('phoneRuntimeProvider: "xai_sip"');
    expect(status).toContain('defaultProvider: "openai_realtime"');

    const policy = read("src/lib/voice/studio-live-test-policy.ts");
    expect(policy).toContain('defaultProvider: "openai_realtime"');
    expect(policy).toContain("OPENAI_REALTIME_DEFAULT_MODEL");
    expect(policy).toContain('phoneRuntimeProvider: "xai_sip"');
  });

  it("keeps the ChatGPT widget on OpenAI Realtime and the rollback Vapi sandbox off the default export", () => {
    const vapiSandbox = read("src/components/VapiLiveVoiceSandbox.tsx");
    const openaiSandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const entry = read("src/components/LiveVoiceSandbox.tsx");

    expect(entry).not.toContain("VapiLiveVoiceSandbox");
    expect(entry).toContain("OpenAILiveVoiceSandbox");
    expect(vapiSandbox).not.toContain("xai-client-secret");
    expect(openaiSandbox).not.toContain("xai-client-secret");
    expect(openaiSandbox).not.toContain("api.x.ai");
  });

  it("limits Studio tools to approved knowledge search", () => {
    const service = read("src/lib/voice/openai-live-agent-service.ts");

    expect(service).toContain('if (input.name !== "search_agent_knowledge")');
    expect(service).toContain("LIVE_DEMO_TOOLS");
    expect(service).toContain("INITIAL APPROVED KNOWLEDGE");
  });

  it("guards the native session mint with spend and launch gates", () => {
    const routes = read("src/routes/grok-voice-routes.ts");
    const start = routes.indexOf('"/api/voice/live/session"');
    const handler = routes.indexOf("async (req: AuthenticatedRequest, res: Response)", start);
    expect(start).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(start);
    const block = routes.slice(start, handler);
    expect(block).toContain("authenticateUser");
    expect(block).toContain("enforceLaunchHardGate");
    expect(block).toContain("enforceSpendCap");
    expect(block).toContain("simulationMinuteQuota");
  });
});
