import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI runtime cohesion across agent postures", () => {
  it("keeps personal and business create paths on the OpenAI structured primary", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const defaults = read("src/lib/agent-create-defaults.ts");
    const models = read("src/lib/ai-models.ts");

    expect(models).toContain("STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(routes).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(routes).toContain("is_business_agent");
    // Posture changes tools/personality, not the provider chain.
    expect(defaults).toContain("resolveCreateEnabledTools");
    expect(defaults).toContain("isBusinessAgent");
    expect(defaults).not.toContain("XAI_STRUCTURED_PRIMARY_MODEL");
    expect(defaults).not.toContain("createGrokVoiceClientSession");
  });

  it("keeps Vapi phone runtime OpenAI-default for every agent posture", () => {
    const models = read("src/lib/ai-models.ts");
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const managedRuntime = read("src/lib/managed-voice-runtime.ts");
    expect(models).toContain('VAPI_TENANT_DEFAULT_PROVIDER = "openai"');
    expect(models).toContain("VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O");
    expect(factory).toContain("isBusinessAgent");
    expect(factory).toContain("buildManagedVoiceRuntime");
    expect(managedRuntime).toContain('provider: "vapi" as const');
    expect(managedRuntime).toContain("fallbackPlan");
    // Business vs personal changes identity copy / tools, not LLM vendor.
    expect(factory).not.toContain('llmProvider: "xai"');
    expect(factory).not.toContain("grok-4.5");
  });

  it("routes hybrid marketing direction and Studio live tests through OpenAI demos", () => {
    const product = read("src/lib/product-copy.ts");
    const liveRoutes = read("src/routes/grok-voice-routes.ts");
    const sandbox = read("src/components/RoleplaySandbox.tsx");

    expect(product).toContain("hybrid:");
    expect(liveRoutes).toContain("createOpenAILiveVoiceCall");
    expect(liveRoutes).not.toContain("createGrokVoiceClientSession");
    expect(sandbox).toContain("OpenAILiveVoiceSandbox");
  });

  it("keeps active architecture docs on the managed OpenAI primary", () => {
    const architecture = read("ARCHITECTURE.md");
    const grokDoc = read("docs/GROK_LIVE_VOICE.md");
    const vendor = read("docs/VENDOR_LAUNCH_MAP.md");

    expect(architecture).toContain("Primary: direct OpenAI Responses API using GPT-5.6 Terra");
    expect(architecture).toContain(
      "Personal agents, business agents, and hybrid direction all share this same managed chain",
    );
    expect(architecture).not.toContain(
      "Primary: direct xAI Responses API using Grok 4.5 by default",
    );
    expect(grokDoc).toContain("retired from demo routing");
    // The compact vendor map is the current operating source of truth.
    expect(vendor).toContain("Structured reasoning | OpenAI managed structured runtime");
    expect(vendor).toContain("optional xAI experiment only when explicitly enabled");
  });
});
