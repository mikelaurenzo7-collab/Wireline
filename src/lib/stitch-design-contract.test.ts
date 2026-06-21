import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";
import { WL_BRAND } from "./wireline-design-system";

const root = resolve(import.meta.dirname, "../..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

function pathExists(rel: string) {
  return existsSync(resolve(root, rel));
}

describe("Stitch design contract", () => {
  it("pins the Wireline OS forest palette and four-pixel geometry", () => {
    expect(WL_BRAND.accentHex.toLowerCase()).toBe("#1a3c34");
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toMatch(/--wl-accent:\s*#1a3c34/i);
    expect(foundation).toMatch(/--wl-bg:\s*#f7f7f5/i);
    expect(foundation).toMatch(/--wl-status-active:\s*#2d5a27/i);
    expect(foundation).toMatch(/--radius:\s*0\.25rem/i);
    expect(foundation).toMatch(/--primary:\s*var\(--wl-accent\)/);
  });

  it("maps every canonical surface to an exact committed Stitch export", () => {
    expect(STITCH_SCREENS["/studio"].stitchFile).toBe(
      ".stitch-export/agent-studio-integrated-creation.html",
    );
    expect(STITCH_SCREENS["/actions"].stitchFile).toBe(
      ".stitch-export/actions-integrations-polished.html",
    );
    expect(STITCH_SCREENS["/settings"].stitchFile).toBe(
      ".stitch-export/workspace-settings.html",
    );
    for (const screen of Object.values(STITCH_SCREENS)) {
      expect(screen.stitchFile).toMatch(/^\.stitch-export\/.+\.html$/);
      expect(pathExists(screen.stitchFile)).toBe(true);
    }
  });

  it("keeps Actions canonical while redirecting old integration bookmarks", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const sharedNav = read("src/constants/navigation.ts");
    expect(routes).toContain('path="/actions" element={<IntegrationsPage />}');
    expect(routes).toContain('path="/integrations" element={<Navigate to="/actions" replace />}');
    expect(shell).toContain('{ href: "/actions", label: "Actions"');
    expect(sharedNav).toContain('path: "/actions"');
    expect(sharedNav).toContain('matches: ["/actions", "/integrations"]');
  });

  it("loads the global cascade in documented order", () => {
    const main = read("src/main.tsx");
    const foundation = main.indexOf('import "./styles/foundation.css";');
    const index = main.indexOf('import "./index.css";');
    const monochrome = main.indexOf('import "./styles/monochrome-guard.css";');
    const readability = main.indexOf('import "./styles/readability-guard.css";');
    expect(foundation).toBeGreaterThanOrEqual(0);
    expect(index).toBeGreaterThan(foundation);
    expect(monochrome).toBeGreaterThan(index);
    expect(readability).toBeGreaterThan(monochrome);

    const appCss = read("src/index.css");
    expect(appCss).toContain('@import "./styles/stitch-patterns.css";');
    expect(appCss).toContain('@import "./styles/workspace-buttons.css";');
  });

  it("removes retired design bridges and preview route code", () => {
    expect(pathExists("src/lib/design-preview-route.ts")).toBe(false);
    expect(pathExists("src/lib/figma-design-system.ts")).toBe(false);
    expect(pathExists("figma.config.json")).toBe(false);

    const strictConfig = read("tsconfig.strict.json");
    expect(strictConfig).not.toContain("design-preview-route.ts");
  });

  it("keeps public brand assets out of the retired violet palette", () => {
    for (const asset of [
      "public/favicon.svg",
      "public/wireline-icon.svg",
      "public/og-image.svg",
      "public/site.webmanifest",
      "public/sw.js",
      "src/components/marketing/RobotHead.tsx",
    ]) {
      const source = read(asset);
      expect(source).not.toMatch(/#7c3aed|#a78bfa|#5b21b6|#3d1e7c/i);
      expect(source).not.toMatch(/(?:text|bg|from|to)-(?:violet|purple|indigo)-/i);
    }
  });

  it("uses the current SVG app mark and removes retired raster icon assets", () => {
    const manifest = read("public/site.webmanifest");
    const worker = read("public/sw.js");
    expect(manifest).toContain('"/wireline-icon.svg"');
    expect(manifest).not.toMatch(/wireline-icon-(512|1024|rounded)\.png/);
    expect(worker).toContain('"wireline-v3"');
    expect(worker).toContain('"/wireline-icon.svg"');
    expect(worker).not.toMatch(/wireline-icon-(512|1024)\.png/);
    expect(pathExists("public/wireline-icon-512.png")).toBe(false);
    expect(pathExists("public/wireline-icon-1024.png")).toBe(false);
    expect(pathExists("public/wireline-icon-rounded.png")).toBe(false);
  });

  it("documents the committed Stitch sources in the code bridge", () => {
    expect(STITCH_CODE_SYSTEM.tokens).toBe("src/styles/foundation.css");
    expect(STITCH_CODE_SYSTEM.patterns).toBe("src/styles/stitch-patterns.css");
    expect(STITCH_CODE_SYSTEM.designMd).toBe(".stitch/DESIGN.md");
    expect(STITCH_CODE_SYSTEM.apiExport).toBe(".stitch-export/manifest.json");
  });
});
