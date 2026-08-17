import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Studio live tests use the same native xAI Speech-to-Speech brain as PSTN", () => {
  it("defaults Studio to authenticated native xAI realtime", () => {
    const sandbox = read("src/components/LiveVoiceSandbox.tsx");
    const live = read("src/components/XAILiveVoiceSandbox.tsx");
    const routes = read("src/routes/grok-voice-routes.ts");
    const status = read("src/lib/voice/xai-live-agent-service.ts");

    expect(sandbox).toContain('from "./XAILiveVoiceSandbox"');
    expect(live).toContain("/api/voice/live/session");
    expect(live).toContain("xai-client-secret.");
    expect(live).toContain("STUDIO_BROWSER_TEST_MAX_SECONDS");
    expect(routes).toContain("createXAILiveVoiceSession");
    expect(routes).toContain('"/api/voice/live/session"');
    expect(routes).not.toContain('"/api/voice/live/web-session"');
    expect(routes).not.toContain("createGrokVoiceClientSession");
    expect(status).toContain('phoneRuntimeProvider: "xai_sip"');
    expect(status).toContain("maxDurationSeconds: STUDIO_BROWSER_TEST_MAX_SECONDS");
  });

  it("keeps the ChatGPT widget on OpenAI Realtime and the rollback Vapi sandbox off the default export", () => {
    const vapiSandbox = read("src/components/VapiLiveVoiceSandbox.tsx");
    const openaiSandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const entry = read("src/components/LiveVoiceSandbox.tsx");

    expect(entry).not.toContain("VapiLiveVoiceSandbox");
    expect(entry).not.toContain("OpenAILiveVoiceSandbox");
    expect(vapiSandbox).not.toContain("xai-client-secret");
    expect(openaiSandbox).not.toContain("xai-client-secret");
    expect(openaiSandbox).not.toContain("api.x.ai");
  });

  it("limits Studio tools to approved knowledge search", () => {
    const service = read("src/lib/voice/xai-live-agent-service.ts");
    const runtime = read("src/lib/voice/xai-agent-runtime.ts");

    expect(service).toContain('if (input.name !== "search_agent_knowledge")');
    expect(runtime).toContain('surface === "browser_test"');
    expect(runtime).toContain("WIRELINE_GROK_REALTIME_TOOLS");
    expect(runtime).toContain("PRIVATE TEST");
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
