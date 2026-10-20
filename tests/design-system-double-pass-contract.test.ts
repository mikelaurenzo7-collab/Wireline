import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOT_MARK_GRADIENT_CAPACITY, botMarkFor } from "../src/lib/bot-mark";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function directCssImports(source: string): string[] {
  return [...source.matchAll(/import\s+["']([^"']+\.css)["']/g)].map((match) => match[1]);
}

describe("WIRELINE design-system double-pass contract", () => {
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

  it("keeps retired face and presenter layers out of active launch identity", () => {
    const retiredPage = read("src/pages/LiveVideoStudioPage.tsx");
    const presenter = read("src/components/LiveVideoPresenter.tsx");
    const compatibilityFace = read("src/components/AgentFace.tsx");
    const spendBoundary = read("tests/credential-and-spend-boundary-contract.test.ts");

    expect(retiredPage).toContain('<Navigate to="/studio" replace />');
    expect(retiredPage).not.toContain("import AgentFace from");
    expect(retiredPage).not.toContain("<AgentFace");
    expect(presenter).toContain('import BotMark from "./BotMark"');
    expect(presenter).toContain("<BotMark");
    expect(presenter).not.toContain("AgentFace");
    expect(presenter).not.toContain("wl-presence-live");
    expect(compatibilityFace).toContain('import BotMark from "./BotMark"');

    // Security/spend auditing must prove the real retirement boundary rather
    // than requiring a retired face symbol to remain in source as a sentinel.
    expect(spendBoundary).toContain(
      "retired Live Video does not load a presenter SDK or session path",
    );
    expect(spendBoundary).toContain("page).toContain('<Navigate to=\"/studio\" replace />')");
    expect(spendBoundary).toContain('page).not.toContain("@heygen/liveavatar-web-sdk")');
    expect(spendBoundary).not.toContain('expect(page).toContain("AgentFace")');
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
      "Bot identity is a customer-selected mark from the curated BotBound set; status remains a separate signal.",
    );
    expect(refinement).toContain('.wl-rail-agent-link[aria-current="page"]');
    expect(botMark).toContain("BOT_MARK_SIGNATURE_CAPACITY = 1_048_576");
    expect(botMark).not.toContain("status-success");
    expect(botMark).not.toContain("status-warning");
    expect(botMark).not.toContain("status-error");
  });

  it("keeps Bot Mark fallback signatures beyond the maximum standard purchasable roster", () => {
    // Retained Business has 15 base Bots and the self-serve add-on route permits
    // up to 100 additional Bots, so 115 is the largest standard catalog roster.
    const standardCommercialCeiling = 115;
    const signatures = new Set(
      Array.from(
        { length: standardCommercialCeiling },
        (_, index) => botMarkFor({ seed: `commercial-slot:${index + 1}` }).gradientSignature,
      ),
    );

    expect(BOT_MARK_GRADIENT_CAPACITY).toBeGreaterThan(standardCommercialCeiling);
    expect(signatures.size).toBe(standardCommercialCeiling);
  });

  it("keeps active customer-facing brand surfaces on Bot language", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");

    expect(landing).not.toMatch(/\bvoice agents?\b/i);
    expect(footer).not.toMatch(/\bvoice agents?\b/i);
    expect(landing).toContain("Answer. Book.");
    expect(landing).toContain("Plan. Coordinate.");
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo/);
  });

  it("keeps BotBound as one cross-platform visual brand while technical wireline stays data", () => {
    const brand = read("src/components/brand/WirelineBrand.tsx");
    const identity = read("src/styles/brand-identity.css");
    const webManifest = read("public/site.webmanifest");
    const extensionManifest = read("apps/browser-extension/manifest.base.json");
    const iosInfo = read("ios/Wireline/Info.plist");
    const iosWidgetInfo = read("ios/WirelineWidgets/Info.plist");
    const androidStrings = read("android/app/src/main/res/values/strings.xml");

    expect(brand).toContain("BOTBOUND_BRAND_NAME as WIRELINE_BRAND_NAME");
    expect(brand).toContain("BotBoundLockup as WirelineLockup");
    expect(brand).toContain("BotBoundWordmark as WirelineWordmark");
    expect(identity).toContain("Customer-visible identity is BotBound");
    expect(identity).toContain("--bb-lockup-mark");
    expect(identity).toContain("--bb-lockup-wordmark-size");

    expect(webManifest).toContain('"short_name": "BotBound"');
    expect(extensionManifest).toContain('"name": "BotBound Command"');
    expect(iosInfo).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>BotBound<\/string>/);
    expect(iosWidgetInfo).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>BotBound<\/string>/);
    expect(androidStrings).toContain('<string name="app_name">BotBound</string>');

    // The brand law does not mutate technical identifiers into cosmetic casing.
    expect(extensionManifest).toContain('"homepage_url": "https://botbound.app"');
    expect(iosInfo).toContain("<string>wireline</string>");
  });
});
