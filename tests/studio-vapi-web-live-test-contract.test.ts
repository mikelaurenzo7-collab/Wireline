import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Studio live tests use the same Vapi Grok 4.3 brain as PSTN", () => {
  it("defaults Studio to authenticated Vapi web with OpenAI Realtime as backup only", () => {
    const policy = read("src/lib/voice/studio-live-test-policy.ts");
    const sandbox = read("src/components/LiveVoiceSandbox.tsx");
    const routes = read("src/routes/grok-voice-routes.ts");

    expect(policy).toContain('sessionMode: vapiConfigured');
    expect(policy).toContain("authenticated_browser_vapi_web");
    expect(policy).toContain("VAPI_TENANT_DEFAULT_MODEL");
    expect(sandbox).toContain("VapiLiveVoiceSandbox");
    expect(sandbox).toContain("OpenAILiveVoiceSandbox");
    expect(sandbox).toContain('body?.defaultProvider === "vapi"');
    expect(routes).toContain('"/api/voice/live/web-session"');
    expect(routes).toContain("createStudioVapiWebSession");
    expect(routes).toContain("createOpenAILiveVoiceCall");
    expect(routes).not.toContain("createGrokVoiceClientSession");
  });

  it("never exposes an xAI client-secret subprotocol on customer Studio widgets", () => {
    const vapiSandbox = read("src/components/VapiLiveVoiceSandbox.tsx");
    const openaiSandbox = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const session = read("src/lib/voice/studio-vapi-web-session.ts");

    expect(vapiSandbox).not.toContain("xai-client-secret");
    expect(vapiSandbox).not.toContain("api.x.ai");
    expect(vapiSandbox).not.toContain("grok-voice-latest");
    expect(openaiSandbox).not.toContain("xai-client-secret");
    expect(openaiSandbox).not.toContain("api.x.ai");
    expect(session).toContain('surface: "browser_test"');
    expect(session).toContain("buildVapiAssistant");
  });

  it("strips write tools on the browser-test assistant and caps the session", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const policy = read("src/lib/voice/studio-live-test-policy.ts");

    expect(factory).toContain('surface?: "pstn" | "browser_test"');
    expect(factory).toContain('browserTest ? ["search_knowledge_base"]');
    expect(factory).toContain("PRIVATE BROWSER TEST");
    expect(policy).toContain("STUDIO_BROWSER_TEST_MAX_SECONDS = 180");
  });

  it("guards the web-session mint with the same spend and launch gates as OpenAI backup", () => {
    const routes = read("src/routes/grok-voice-routes.ts");
    const start = routes.indexOf('"/api/voice/live/web-session"');
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
