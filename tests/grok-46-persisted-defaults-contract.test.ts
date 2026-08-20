import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

execFileSync(process.execPath, ["scripts/materialize-drizzle-meta.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("persisted runtime-default migration history", () => {
  it("keeps applied 0151 immutable and reconciles through 0154", () => {
    const legacy = read("drizzle/migrations/0151_xai_grok_46_runtime_defaults.sql");
    const correction = read("drizzle/migrations/0154_xai_grok_46_persisted_defaults.sql");
    expect(legacy).toContain("grok-4.3");
    expect(correction).toContain("Do not rewrite 0151");
    expect(correction).toContain("ALTER COLUMN voice_llm_model SET DEFAULT 'grok-4.6'");
    expect(correction).toContain("voice_llm_provider = 'xai'");
    expect(correction).toContain("voice_llm_model = 'grok-4.3'");
    expect(correction).not.toMatch(/provider\s*<>|model\s*<>/);
  });

  it("forward-fixes the invalid Vapi pair without rewriting history or PSTN", () => {
    const schema = read("src/db/schema.ts");
    const base = read("src/db/schema-base.ts");
    const journal = read("drizzle/migrations/meta/_journal.json");
    const materializer = read("scripts/materialize-drizzle-meta.mjs");
    const correction = read("drizzle/migrations/0156_openai_runtime_cohesion.sql");
    const snapshot = read("drizzle/migrations/meta/0054_snapshot.json");

    for (const source of [schema, base]) {
      expect(source).toContain('voiceLlmProvider: text("voice_llm_provider").default("openai")');
      expect(source).toContain('voiceLlmModel: text("voice_llm_model").default("gpt-4o")');
      expect(source).toContain("Rollback-only Vapi language-model pair");
    }
    expect(schema).toContain("0156_openai_runtime_cohesion.sql");
    expect(base).toContain("0156_openai_runtime_cohesion.sql");
    expect(journal).toContain('"idx": 52');
    expect(journal).toContain('"tag": "0154_xai_grok_46_persisted_defaults"');
    expect(journal).toContain('"idx": 54');
    expect(journal).toContain('"tag": "0156_openai_runtime_cohesion"');
    expect(materializer).toContain("TARGET_0054_PATH");
    expect(materializer).toContain("buildOpenAIRuntimeCohesionSnapshot");
    expect(materializer).not.toContain('TARGET_0054_SHA256 = "PENDING_COMPUTE"');
    expect(snapshot).toContain(`"default": "'openai'"`);
    expect(snapshot).toContain(`"default": "'gpt-4o'"`);
    expect(correction).toContain("voice_llm_provider = 'xai'");
    expect(correction).toContain("voice_llm_model = 'grok-4.6'");
    expect(correction).not.toContain("ALTER COLUMN voice_provider");
  });
});
