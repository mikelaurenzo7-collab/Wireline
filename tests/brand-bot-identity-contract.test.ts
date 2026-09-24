import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("BotBound brand migration", () => {
  it("uses the Presenting robot character as the canonical visual identity", () => {
    const component = read("src/components/brand/BotBoundMark.tsx");
    const icon = read("public/botbound-icon.svg");
    const favicon = read("public/favicon.svg");
    expect(component).toContain('data-botbound-mark="character"');
    expect(component).toContain('src="/brand/botbound-app-icon.png"');
    expect(component).toContain("Presenting robot character");
    expect(component).toContain("No baked");
    expect(component).not.toContain("receiver");
    expect(component).not.toContain("phone-bot");
    expect(component).not.toContain("landline");
    expect(component).not.toContain("<svg");
    expect(component).not.toContain("presenting-lockup");
    expect(component).not.toContain("botbound-mark.png");
    for (const source of [icon, favicon]) {
      expect(source).toContain("BotBound");
      expect(source).toMatch(/phone|Phone/);
      expect(source).toContain("#A78BFA");
      expect(source).not.toContain("folded violet and platinum W");
      expect(source).not.toContain("botbound-app-icon.png");
    }
  });

  it("makes BotBound canonical while old Wireline component paths are render-safe aliases", () => {
    const brand = read("src/components/brand/BotBoundBrand.tsx");
    const identityCss = read("src/styles/brand-identity.css");
    const legacyBrand = read("src/components/brand/WirelineBrand.tsx");
    const legacyMark = read("src/components/brand/WirelineMark.tsx");
    expect(brand).toContain("BotBoundWordmark");
    expect(brand).toContain("BotBoundLockup");
    expect(brand).toContain('data-botbound-brand-lockup="true"');
    expect(identityCss).toContain("margin-inline-start: calc(var(--bb-lockup-overlap) * -1)");
    expect(legacyBrand).toContain("BotBoundWordmark as WirelineWordmark");
    expect(legacyBrand).toContain("BotBoundLockup as WirelineLockup");
    expect(legacyMark).toContain('from "./BotBoundMark"');
  });

  it("pins the new name, concise product promise, and Studio-first install path", () => {
    const product = read("src/lib/bot-product.ts");
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      start_url: string;
      icons: Array<{ src: string }>;
      shortcuts: Array<{ name: string; url: string }>;
    };
    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "Put Your Bot on the Line"');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(product).toContain('promise: "Your Bot for calls, texts, and email."');
    expect(manifest.name).toContain("BotBound");
    expect(manifest.short_name).toBe("BotBound");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.icons[0]?.src).toBe("/botbound-icon-192.png");
    expect(manifest.shortcuts.find((shortcut) => shortcut.name === "CALLS")?.url).toBe("/phone");
  });

  it("keeps the legacy technical namespace deliberately separate from customer identity", () => {
    const identity = read("src/lib/brand.ts");
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(identity).toContain('customerFacing: "BotBound"');
    expect(identity).toContain('technicalNamespace: "wireline"');
    expect(shell).toContain('WORKSPACE_RAIL_STORAGE_KEY = "wireline:workspace-rail:v1"');
    expect(shell).not.toContain("WirelineNative");
    expect(shell).toContain('aria-label="BotBound Studio"');
    expect(shell).toContain("<BotBoundMark");
    expect(shell).toContain("<BotBoundWordmark");
  });

  it("keeps public BotBound identity immutable while callback origins remain configuration-driven", () => {
    const appUrl = read("src/lib/app-url.ts");
    const pageMeta = read("src/lib/page-meta.tsx");
    const routeMeta = read("src/lib/marketing-route-meta.ts");
    const landing = read("src/pages/LandingPage.tsx");
    const prerender = read("scripts/prerender-marketing-meta.mts");
    const oauth = read("src/lib/oauth-helpers.ts");

    expect(appUrl).toContain("process.env.APP_URL");
    for (const source of [pageMeta, routeMeta, landing]) {
      expect(source).toContain("BOTBOUND_PRODUCTION_ORIGIN");
      expect(source).not.toContain("VITE_PUBLIC_SITE_URL");
      expect(source).not.toContain("LEGACY_PRODUCTION_ORIGIN");
    }
    expect(routeMeta).not.toContain("process.env.APP_URL");
    expect(prerender).not.toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(prerender).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(oauth).toContain("APP_URL is required for OAuth redirects in production");
    expect(oauth).toContain("/api/oauth/google/callback");
    expect(oauth).not.toContain("botbound.ai");
  });

  it("does not keep Wireline-named public brand twins beside the BotBound masters", () => {
    const renderer = read("scripts/render-image-assets.mjs");
    expect(renderer).toContain("RETIRED_WIRELINE_TWINS");
    expect(renderer).not.toContain('out: "public/wireline-stripe-logo.png"');
    expect(renderer).not.toContain("writeFileSync(resolve(root, \"public/wireline-icon.svg\")");
    for (const twin of [
      "public/wireline-icon.svg",
      "public/wireline-icon-192.png",
      "public/wireline-icon-512.png",
      "public/wireline-stripe-icon.jpg",
      "public/wireline-stripe-icon.png",
      "public/wireline-stripe-logo.jpg",
      "public/wireline-stripe-logo.png",
      "public/wireline-stripe-logo.svg",
      "public/wireline-chatgpt-app-icon.svg",
    ]) {
      expect(existsSync(resolve(process.cwd(), twin)), twin).toBe(false);
    }
  });
});
