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

    expect(models).toContain("STRUCTURED_RUNTIME_MODELS");
    expect(models).toContain("STRUCTURED_DIRECTOR_DEEP_MODEL");
    expect(models).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(aiModels).toContain("export const OPENAI_STRUCTURED_PRIMARY_MODEL");
  });

  it("routes planners through structured-runtime-models instead of legacy Claude shims", () => {
    for (const path of [
      "src/lib/director-planner.ts",
      "src/lib/workspace-planner.ts",
      "src/routes/agent-workspace-routes.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("structured-runtime-models");
      expect(source).not.toContain("./claude-models");
    }
    const directorTurn = read("src/lib/director-turn.ts");
    expect(directorTurn).not.toContain("./claude-models");
    expect(directorTurn).toContain('tier: "standard"');
    expect(directorTurn).toContain('tier: "deep"');
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
