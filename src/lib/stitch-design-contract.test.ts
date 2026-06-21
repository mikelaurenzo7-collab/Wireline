import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";
import { WL_BRAND } from "./wireline-design-system";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => existsSync(resolve(root, path));

describe("Wireline Stitch contract", () => {
  it("pins the committed forest, warm-surface, and four-pixel system", () => {
    const foundation = read("src/styles/foundation.css");
    expect(WL_BRAND.accentHex.toLowerCase()).toBe("#1a3c34");
    expect(foundation).toMatch(/--wl-accent:\s*#1a3c34/i);
    expect(foundation).toMatch(/--wl-bg:\s*#f7f7f5/i);
    expect(foundation).toMatch(/--radius:\s*0\.25rem/i);
  });

  it("maps canonical workspace screens to committed Stitch exports", () => {
    expect(STITCH_SCREENS["/studio"].stitchFile).toBe(".stitch-export/agent-studio-integrated-creation.html");
    expect(STITCH_SCREENS["/actions"].stitchFile).toBe(".stitch-export/actions-integrations-polished.html");
    for (const screen of Object.values(STITCH_SCREENS)) expect(exists(screen.stitchFile)).toBe(true);
  });

  it("keeps Actions canonical and personal use discoverable", () => {
    const workspaceRoutes = read("src/routes/AppRoutes.tsx");
    const publicRoutes = read("src/App.tsx");
    const header = read("src/components/marketing/PublicSiteHeader.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    expect(workspaceRoutes).toContain('path="/actions" element={<IntegrationsPage />}');
    expect(workspaceRoutes).toContain('path="/integrations" element={<Navigate to="/actions" replace />}');
    expect(publicRoutes).toContain('path="/for/personal" element={<VerticalLanding slug="personal" />}');
    expect(header).toContain('to: "/for/personal"');
    expect(footer).toContain('to: "/for/personal"');
  });

  it("keeps public marketing pages on live Stitch primitives", () => {
    for (const path of [
      "src/pages/Features.tsx",
      "src/pages/Compare.tsx",
      "src/pages/Showcase.tsx",
      "src/pages/About.tsx",
      "src/pages/VerticalLanding.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("wl-stitch");
      expect(source).not.toMatch(/font-display|bg-gradient-to-r|#1d1d1f|#f2f2ef/i);
    }
  });

  it("keeps only the live Stitch contract in strict validation", () => {
    const strictConfig = read("tsconfig.strict.json");
    expect(strictConfig).toContain("stitch-design-contract.test.ts");
    expect(strictConfig).toContain("stitch-design-system.ts");
  });

  it("documents the committed sources", () => {
    expect(STITCH_CODE_SYSTEM.tokens).toBe("src/styles/foundation.css");
    expect(STITCH_CODE_SYSTEM.patterns).toBe("src/styles/stitch-patterns.css");
    expect(STITCH_CODE_SYSTEM.designMd).toBe(".stitch/DESIGN.md");
    expect(STITCH_CODE_SYSTEM.apiExport).toBe(".stitch-export/manifest.json");
  });
});
