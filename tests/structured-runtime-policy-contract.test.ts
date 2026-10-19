import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("structured and voice runtime policy", () => {
  it("keeps structured reasoning xAI-first with OpenAI as the backup", () => {
    const models = read("src/lib/structured-runtime-models.ts");
    const aiModels = read("src/lib/ai-models.ts");
    const policy = read("src/lib/reasoning-provider-policy.ts");
    expect(models).toContain("STRUCTURED_PRIMARY_MODEL");
    expect(aiModels).toContain("STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL");
    expect(policy).toContain('"xai",\n  "openai",\n  "gateway"');
    expect(policy).not.toMatch(/"gemini"/);
  });

  it("makes OpenAI Realtime the database and application voice default", () => {
    const schema = read("src/db/schema-base.ts");
    const migration = read("drizzle/migrations/0168_openai_realtime_voice_runtime.sql");
    const runtime = read("src/lib/managed-voice-runtime.ts");
    expect(schema).toContain('voiceProvider: text("voice_provider").default("openai")');
    expect(migration).toContain("NEW.voice_provider := 'openai'");
    expect(migration).toContain("voice_llm_model SET DEFAULT 'gpt-realtime-2.1'");
    expect(runtime).toContain('provider: "openai" as const');
    expect(runtime).not.toMatch(/fallbackPlan|provider:\s*"11labs"|vapi|xai|grok/i);
  });

  it("requires the OpenAI SIP project and signed webhook in production", () => {
    const prod = read("scripts/check-prod-env.mjs");
    const example = read(".env.example");
    expect(prod).toContain('"OPENAI_PROJECT_ID"');
    expect(prod).toContain('"OPENAI_WEBHOOK_SECRET"');
    expect(example).toContain("OPENAI_PROJECT_ID=");
    expect(example).toContain("OPENAI_WEBHOOK_SECRET=");
    // Only the retired xAI leftovers stay out of the inventory; the live keys
    // are documented below.
    expect(example).not.toMatch(
      /VAPI_|XAI_API_KEY_CHATKIT|XAI_SIP_ALLOWED_ADDRESSES|WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK|GEMINI_API_KEY/,
    );
  });

  it("documents the xAI keys the primary lane and knowledge index depend on", () => {
    const example = read(".env.example");
    const prod = read("scripts/check-prod-env.mjs");
    const validator = read("src/lib/env-validator.ts");
    for (const key of ["XAI_API_KEY", "XAI_MANAGEMENT_API_KEY"]) {
      expect(example).toContain(`\n${key}=`);
      expect(prod).toContain(`"${key}"`);
      expect(validator).toContain(`name: "${key}"`);
    }
    // xAI leads the inventory the way it leads the runtime chain.
    expect(example.indexOf("\nXAI_API_KEY=")).toBeLessThan(example.indexOf("\nOPENAI_API_KEY="));
    expect(prod).not.toContain('"GEMINI_API_KEY"');
    expect(validator).not.toContain('name: "GEMINI_API_KEY"');
  });

  it("removes retired provider modules and public claims", () => {
    for (const path of [
      "src/routes/vapi-v2.ts",
      "src/routes/xai-voice-routes.ts",
      "src/routes/grok-voice-routes.ts",
      "src/lib/vapi-client.ts",
      "src/lib/voice/xai-sip-session.ts",
    ]) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const logos = read("src/components/layout/IntegrationLogos.tsx");
    // Voice and language processing is disclosed as a category, with no vendor branding.
    expect(privacy.replace(/\s+/g, " ")).toContain(
      "process AI requests, live phone conversations, and browser voice rehearsals through our AI model providers",
    );
    expect(privacy).not.toMatch(/Grok|xAI/);
    expect(`${privacy}\n${logos}`).not.toMatch(/>Vapi<|ALL_LOGOS\.vapi/i);
  });

  it("keeps direct OpenAI structured calls stateless", () => {
    const client = read("src/lib/ai-client.ts");
    expect(client).toContain("store: false");
    expect(client).toContain("safety_identifier");
    expect(client).toContain("disallowPromptTraining: true");
    expect(client).toContain("await response.body.cancel()");
  });
});
