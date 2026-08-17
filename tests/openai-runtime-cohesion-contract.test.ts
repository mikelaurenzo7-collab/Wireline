import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("xAI Grok 4.6 runtime cohesion across agent postures", () => {
  it("keeps personal and business create paths on the xAI structured primary", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const defaults = read("src/lib/agent-create-defaults.ts");
    const models = read("src/lib/ai-models.ts");

    expect(models).toContain(
      "STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL",
    );
    expect(routes).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(routes).toContain("is_business_agent");
    expect(defaults).toContain("resolveCreateEnabledTools");
    expect(defaults).toContain("isBusinessAgent");
    expect(defaults).not.toContain("XAI_STRUCTURED_PRIMARY_MODEL");
    expect(defaults).not.toContain("createGrokVoiceClientSession");
  });

  it("keeps Vapi phone runtime xAI-default for every agent posture", () => {
    const models = read("src/lib/ai-models.ts");
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const managedRuntime = read("src/lib/managed-voice-runtime.ts");
    expect(models).toContain('VAPI_TENANT_DEFAULT_PROVIDER = "xai"');
    expect(models).toContain(
      "VAPI_TENANT_DEFAULT_MODEL = XAI_MODELS.GROK_4_3",
    );
    expect(factory).toContain("isBusinessAgent");
    expect(factory).toContain("buildManagedVoiceRuntime");
    expect(managedRuntime).toContain('provider: "xai" as const');
    expect(managedRuntime).toContain('provider: "vapi" as const');
    expect(managedRuntime).toContain("fallbackPlan");
    expect(factory).not.toContain('llmProvider: "xai"');
    expect(factory).not.toContain("grok-4.5");
  });

  it("routes hybrid marketing direction through Studio Vapi tests with OpenAI backup", () => {
    const product = read("src/lib/product-copy.ts");
    const liveRoutes = read("src/routes/grok-voice-routes.ts");
    const sandbox = read("src/components/LiveVoiceSandbox.tsx");

    expect(product).toContain("hybrid:");
    expect(liveRoutes).toContain("createStudioVapiWebSession");
    expect(liveRoutes).toContain("createOpenAILiveVoiceCall");
    expect(liveRoutes).not.toContain("createGrokVoiceClientSession");
    expect(sandbox).toContain("VapiLiveVoiceSandbox");
    expect(sandbox).toContain("OpenAILiveVoiceSandbox");
  });

  it("keeps active architecture docs on the managed xAI Grok 4.6 primary", () => {
    const architecture = read("ARCHITECTURE.md");
    const grokDoc = read("docs/GROK_LIVE_VOICE.md");
    const vendor = read("docs/VENDOR_LAUNCH_MAP.md");

    expect(architecture).toContain(
      "Primary: direct xAI Responses API using Grok 4.6 by default",
    );
    expect(architecture).toContain(
      "Personal agents, business agents, and hybrid direction all share this same managed chain",
    );
    expect(architecture).toContain(
      "xAI Grok 4.3 is the managed Vapi language model",
    );
    expect(grokDoc).toContain("it is not a Vapi live-call model id");
    expect(vendor).toContain("Structured reasoning | xAI Grok 4.6 managed structured runtime");
    expect(vendor).toContain("OpenAI, then Gemini, then Vercel AI Gateway");
  });
});
