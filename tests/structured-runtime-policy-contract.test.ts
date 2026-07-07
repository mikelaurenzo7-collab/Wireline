import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const LEGACY_CLAUDE_MODULES = [
  "claude-brain.ts",
  "claude-client.ts",
  "claude-models.ts",
  "claude-structured.ts",
  "claude-audit.ts",
  "claude-tools.ts",
  "claude-recipes.ts",
  "claude-response-helpers.ts",
  "claude-supervisor-tools.ts",
];

describe("structured runtime policy", () => {
  it("exports managed OpenAI-first structured models", () => {
    const models = read("src/lib/structured-runtime-models.ts");
    const aiModels = read("src/lib/ai-models.ts");
    const schema = read("src/db/schema.ts");
    const adminSettings = read("src/components/AdminSettings.tsx");
    const carrierPanel = read("src/components/admin/CarrierPanel.tsx");
    const prodEnvCheck = read("scripts/check-prod-env.mjs");
    const legalPage = read("src/components/LegalPage.tsx");
    const integrationLogos = read("src/components/layout/IntegrationLogos.tsx");
    const migrationJournal = read("drizzle/migrations/meta/_journal.json");
    const migrationCorpus = readdirSync(resolve(root, "drizzle/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => read(`drizzle/migrations/${name}`))
      .join("\n");

    expect(models).toContain("STRUCTURED_RUNTIME_MODELS");
    expect(models).toContain("STRUCTURED_DIRECTOR_DEEP_MODEL");
    expect(models).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(aiModels).toContain("export const OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(schema).toContain('voiceLlmProvider: text("voice_llm_provider").default("openai")');
    expect(schema).toContain('voiceLlmModel: text("voice_llm_model").default("gpt-4o")');
    expect(adminSettings).toContain("VAPI_TENANT_DEFAULT_PROVIDER");
    expect(adminSettings).toContain("VAPI_TENANT_DEFAULT_MODEL");
    expect(adminSettings).not.toContain('"anthropic"');
    expect(adminSettings).not.toContain('"claude-sonnet-4-6"');
    expect(carrierPanel).toContain("OpenAI GPT-4o");
    expect(carrierPanel).toContain("VAPI_TENANT_DEFAULT_MODEL");
    expect(carrierPanel).not.toContain("Claude Sonnet 4.6");
    expect(carrierPanel).not.toContain("Anthropic voice disruptions");
    expect(carrierPanel).not.toContain('v: "anthropic"');
    expect(prodEnvCheck).not.toContain("ANTHROPIC_API_KEY");
    expect(prodEnvCheck).toContain("Direct OpenAI fallback and OpenAI Realtime sessions");
    expect(legalPage).toContain("<strong>OpenAI</strong>");
    expect(legalPage).toContain("<strong>Google Gemini</strong>");
    expect(legalPage).not.toContain("Anthropic's Claude API");
    expect(legalPage).not.toContain("<strong>Anthropic</strong>");
    expect(integrationLogos).toContain("ALL_LOGOS.openai");
    expect(integrationLogos).not.toContain("ALL_LOGOS.anthropic");
    expect(migrationCorpus).toContain("voice_llm_provider SET DEFAULT 'openai'");
    expect(migrationCorpus).toContain("voice_llm_model SET DEFAULT 'gpt-4o'");
    expect(migrationCorpus).toContain("claude-haiku-4-5");
    expect(migrationJournal).toContain("0083_reassert_openai_voice_defaults");
    expect(existsSync(resolve(root, "src/routes/admin-migrate"))).toBe(false);
    expect(existsSync(resolve(root, "src/routes/admin-operating-routes.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/routes/admin-purge-accounts-routes.ts"))).toBe(false);
  });

  it("routes planners through structured-runtime-models instead of legacy Claude shims", () => {
    for (const path of ["src/lib/workspace-planner.ts", "src/routes/agent-workspace-routes.ts"]) {
      const source = read(path);
      expect(source).toContain("structured-runtime-models");
      expect(source).not.toContain("./claude-models");
    }
    expect(existsSync(resolve(root, "src/lib/director-planner.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/director-turn.ts"))).toBe(false);
  });

  it("keeps legacy Claude modules out of src/lib", () => {
    const libDir = resolve(root, "src/lib");
    const remaining = LEGACY_CLAUDE_MODULES.filter((file) => existsSync(resolve(libDir, file)));
    expect(remaining).toEqual([]);
    expect(existsSync(resolve(root, "src/routes/claude-routes.ts"))).toBe(false);
  });

  it("does not reintroduce claude-models via stray filenames", () => {
    const libFiles = readdirSync(resolve(root, "src/lib"));
    const claudeNamed = libFiles.filter(
      (name) => name.startsWith("claude-") && !name.endsWith(".test.ts"),
    );
    expect(claudeNamed).toEqual([]);
  });
});
