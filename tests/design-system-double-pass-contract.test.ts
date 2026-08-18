import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function directCssImports(source: string): string[] {
  return [...source.matchAll(/import\s+["']([^"']+\.css)["']/g)].map((match) => match[1]);
}

describe("Wireline design-system double-pass contract", () => {
  it("keeps one JavaScript-owned CSS entrypoint", () => {
    const importers = globSync("src/**/*.{ts,tsx}", { cwd: root })
      .map((file) => ({ file: file.replaceAll("\\", "/"), imports: directCssImports(read(file)) }))
      .filter((entry) => entry.imports.length > 0);

    expect(importers).toEqual([{ file: "src/main.tsx", imports: ["./index.css"] }]);
  });

  it("keeps terminal design layers in one deliberate cascade", () => {
    const index = read("src/index.css");
    const prestige = index.indexOf('@import "./styles/prestige-polish.css";');
    const brand = index.indexOf('@import "./styles/brand-identity.css";');
    const refinement = index.indexOf('@import "./styles/system-aesthetic-refinement.css";');
    const safeArea = index.indexOf('@import "./styles/safe-area-ownership.css";');

    expect(prestige).toBeGreaterThan(-1);
    expect(brand).toBeGreaterThan(prestige);
    expect(refinement).toBeGreaterThan(brand);
    expect(safeArea).toBeGreaterThan(refinement);
    expect(index).toContain('@import "./styles/bot-mark.css";');
  });

  it("gives compact Bot presence to product surfaces, not marketing", () => {
    const product = read("src/styles/wireline-product-surfaces.css");
    const marketing = read("src/styles/wireline-marketing-surfaces.css");

    expect(product).toContain('@import "./agent-presence.css";');
    expect(marketing).not.toContain("agent-presence.css");
    expect(marketing).not.toContain("agent-face.css");
    expect(marketing).not.toContain("video-receptionist.css");
    expect(existsSync(resolve(root, "src/styles/agent-face.css"))).toBe(false);
    expect(existsSync(resolve(root, "src/styles/video-receptionist.css"))).toBe(false);
  });

  it("keeps workspace layout in component source and signature CSS decorative", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const signature = read("src/styles/wireline-app-signature.css");

    expect(shell).toContain("wl-task-header");
    expect(shell).toContain("md:grid-cols-[minmax(0,1fr)_auto]");
    expect(signature).not.toContain(".wl-workspace-main > .relative.mb-4.pb-3");
    expect(signature).not.toContain("Sidebar agent rail");
    expect(signature).toContain("platinum/violet caps on cards");
  });

  it("keeps identity semantics distinct from status semantics", () => {
    const vision = read("src/lib/wireline-design-vision.ts");
    const refinement = read("src/styles/system-aesthetic-refinement.css");
    const botMark = read("src/lib/bot-mark.ts");

    expect(vision).toContain(
      "Bot identity is a role-agnostic Wireline signal signature; status colors communicate state only.",
    );
    expect(refinement).toContain('.wl-rail-agent-link[aria-current="page"]');
    expect(botMark).toContain("BOT_MARK_GRADIENT_CAPACITY = 1_048_576");
    expect(botMark).not.toContain("status-success");
    expect(botMark).not.toContain("status-warning");
    expect(botMark).not.toContain("status-error");
  });

  it("keeps active customer-facing brand surfaces on Bot language", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    const demo = read("src/components/marketing/BrowserCallWidget.tsx");

    expect(landing).not.toMatch(/\bvoice agents?\b/i);
    expect(footer).not.toMatch(/\bvoice agents?\b/i);
    expect(demo).not.toMatch(/\bBot avatar\b/i);
    expect(demo).toContain("Bot mark");
  });
});
