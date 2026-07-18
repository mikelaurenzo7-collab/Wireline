import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const routes = read("src/routes/AppRoutes.tsx");
const studio = read("src/pages/AgentStudioHome.tsx");
const manifest = read("src/lib/studio-canvas-contract.ts");
const executableManifest = read("scripts/lib/studio-canvas-contract.mjs");

describe("neutral Studio entry", () => {
  it("uses the canonical Studio module", () => {
    expect(routes).toContain('import("../pages/AgentStudioHome")');
    expect(routes).not.toContain("AgentStudioHomeClaude");
    expect(studio).toContain("export default function AgentStudioHome()");
  });

  it("removes the former provider-named module", () => {
    expect(existsSync(resolve(root, "src/pages/AgentStudioHome.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/pages/AgentStudioHomeClaude.tsx"))).toBe(false);
  });

  it("keeps both Studio manifests aligned", () => {
    for (const source of [manifest, executableManifest]) {
      expect(source).toContain('studioHome: "src/pages/AgentStudioHome.tsx"');
      expect(source).toContain("provider-neutral-studio-route");
      expect(source).toContain("provider-bound-studio-route");
    }
  });
});
