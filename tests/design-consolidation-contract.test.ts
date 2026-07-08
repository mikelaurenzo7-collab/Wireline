import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("design consolidation contracts", () => {
  it("bundles CSS passes into three wireline surface tiers from index.css", () => {
    const indexCss = read("src/index.css");
    expect(indexCss).toContain('@import "./styles/wireline-layout-passes.css"');
    expect(indexCss).toContain('@import "./styles/wireline-product-surfaces.css"');
    expect(indexCss).toContain('@import "./styles/wireline-marketing-surfaces.css"');
    expect(indexCss).toContain('@import "./styles/letterpress-polish.css"');
    expect(indexCss).not.toContain('@import "./styles/clarity-system.css"');
  });

  it("keeps a single canonical EmptyState implementation", () => {
    const atoms = read("src/components/atoms/EmptyState.tsx");
    const ui = read("src/components/ui/EmptyState.tsx");
    expect(atoms).toContain('export { EmptyState } from "../ui/EmptyState"');
    expect(ui).toContain("export function EmptyState");
    expect(ui).not.toContain('from "../atoms/EmptyState"');
  });

  it("routes skeleton presets through atoms and the Skeleton barrel", () => {
    const barrel = read("src/components/Skeleton.tsx");
    const presets = read("src/components/atoms/skeleton-presets.tsx");
    expect(barrel).toContain("./atoms/skeleton-presets");
    expect(presets).toContain("export function PanelSkeleton");
    expect(presets).toContain('from "./Skeleton"');
  });

  it("migrates hot-path surfaces off studio-card to wl-paper primitives", () => {
    const migrated = [
      "src/pages/OverviewPage.tsx",
      "src/components/CreateAgentDialog.tsx",
      "src/pages/KnowledgePage.tsx",
      "src/components/voice/VoiceGallery.tsx",
    ];
    for (const file of migrated) {
      const source = read(file);
      expect(source).toContain("wl-paper");
      expect(source).not.toContain("studio-card");
    }
  });
});
