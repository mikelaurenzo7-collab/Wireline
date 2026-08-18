import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

execFileSync(process.execPath, ["scripts/materialize-drizzle-meta.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("persisted Grok 4.6 managed defaults", () => {
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

  it("aligns both schema mirrors and journals a reproducible snapshot", () => {
    const schema = read("src/db/schema.ts");
    const base = read("src/db/schema-base.ts");
    const journal = read("drizzle/migrations/meta/_journal.json");
    const materializer = read("scripts/materialize-drizzle-meta.mjs");
    const snapshot = read("drizzle/migrations/meta/0052_snapshot.json");

    for (const source of [schema, base]) {
      expect(source).toContain('voiceLlmModel: text("voice_llm_model").default("grok-4.6")');
      expect(source).not.toContain('voiceLlmModel: text("voice_llm_model").default("grok-4.3")');
    }
    expect(schema).toContain("0154_xai_grok_46_persisted_defaults.sql");
    expect(base).toContain("0154_xai_grok_46_persisted_defaults.sql");
    expect(journal).toContain('"idx": 52');
    expect(journal).toContain('"tag": "0154_xai_grok_46_persisted_defaults"');
    expect(materializer).toContain("TARGET_0052_PATH");
    expect(materializer).toContain("buildGrok46DefaultsSnapshot");
    expect(materializer).not.toContain('TARGET_0052_SHA256 = "PENDING_COMPUTE"');
    expect(snapshot).toContain(`"default": "'grok-4.6'"`);
  });
});
