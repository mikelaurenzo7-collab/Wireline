import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("BotBound brand migration", () => {
  it("uses the approved phone-Bot mark as the canonical visual identity", () => {
    const component = read("src/components/brand/BotBoundMark.tsx");
    const icon = read("public/botbound-icon.svg");
    const favicon = read("public/favicon.svg");
    expect(component).toContain('data-botbound-mark="phone-bot"');
    expect(component).toContain("Receiver held to the Bot's ear");
    for (const source of [icon, favicon]) {
      expect(source).toContain("BotBound");
      expect(source).toMatch(/phone|Phone/);
      expect(source).not.toContain("folded violet and platinum W");
    }
  });

  it("makes BotBound canonical while old Wireline component paths are render-safe aliases", () => {
    const brand = read("src/components/brand/BotBoundBrand.tsx");
    const legacyBrand = read("src/components/brand/WirelineBrand.tsx");
    const legacyMark = read("src/components/brand/WirelineMark.tsx");
    expect(brand).toContain("BotBoundWordmark");
    expect(brand).toContain("BotBoundLockup");
    expect(brand).toContain('data-botbound-brand-lockup="true"');
    expect(legacyBrand).toContain("BotBoundWordmark as WirelineWordmark");
    expect(legacyBrand).toContain("BotBoundLockup as WirelineLockup");
    expect(legacyMark).toContain('from "./BotBoundMark"');
  });

  it("pins the new name, concise product promise, and Studio-first install path", () => {
    const product = read("src/lib/bot-product.ts");
    const manifest = JSON.parse(read("public/site.webmanifest")) as { name: string; short_name: string; start_url: string; icons: Array<{ src: string }> };
    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "PUT YOUR BOT ON THE LINE"');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(product).toContain('promise: "AI employees for calls, texts, and email."');
    expect(manifest.name).toContain("BotBound");
    expect(manifest.short_name).toBe("BotBound");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.icons[0]?.src).toBe("/botbound-icon.svg");
  });

  it("keeps the legacy technical namespace deliberately separate from customer identity", () => {
    const identity = read("src/lib/brand.ts");
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(identity).toContain('customerFacing: "BotBound"');
    expect(identity).toContain('technicalNamespace: "wireline"');
    expect(shell).toContain('WORKSPACE_RAIL_STORAGE_KEY = "wireline:workspace-rail:v1"');
    expect(shell).toContain("WirelineNative");
    expect(shell).toContain('aria-label="BotBound Studio"');
    expect(shell).toContain("<BotBoundMark");
    expect(shell).toContain("<BotBoundWordmark");
  });

  it("makes tomorrow's domain switch configuration-driven instead of another code rename", () => {
    const appUrl = read("src/lib/app-url.ts");
    const pageMeta = read("src/lib/page-meta.tsx");
    const routeMeta = read("src/lib/marketing-route-meta.ts");
    const prerender = read("scripts/prerender-marketing-meta.mts");
    const oauth = read("src/lib/oauth-helpers.ts");
    expect(appUrl).toContain("process.env.APP_URL");
    expect(pageMeta).toContain("import.meta.env.VITE_PUBLIC_SITE_URL");
    expect(routeMeta).toContain("process.env.VITE_PUBLIC_SITE_URL");
    expect(routeMeta).toContain("process.env.APP_URL");
    expect(prerender).toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(oauth).toContain("APP_URL is required for OAuth redirects in production");
    expect(oauth).toContain("/api/oauth/google/callback");
    expect(oauth).not.toContain("botbound.ai");
  });
});
