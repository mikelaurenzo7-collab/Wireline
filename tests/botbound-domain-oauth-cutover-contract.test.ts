import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const INTEGRATION_ROUTE_FILES = globSync("src/routes/oauth/*.ts", { cwd: root })
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => !file.endsWith("/index.ts") && !file.endsWith("/status.ts"))
  .sort();

describe("BotBound domain and OAuth cutover boundary", () => {
  it("keeps brand identity separate from the stable technical namespace", () => {
    const brand = read("src/lib/brand.ts");
    expect(brand).toContain('name: "BotBound"');
    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(brand).toContain('legacyProductionOrigin: "https://trywireline.com"');
    expect(brand).toContain('customerFacing: "BotBound"');
  });

  it("makes tomorrow's hostname cutover configuration-only", () => {
    const appUrl = read("src/lib/app-url.ts");
    const pageMeta = read("src/lib/page-meta.tsx");
    const marketingMeta = read("src/lib/marketing-route-meta.ts");

    expect(appUrl).toContain("process.env.APP_URL");
    expect(appUrl).toContain('throw new Error("APP_URL is required in production")');
    expect(pageMeta).toContain("import.meta.env.VITE_PUBLIC_SITE_URL");
    expect(pageMeta).toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(marketingMeta).toContain("process.env.VITE_PUBLIC_SITE_URL");
    expect(marketingMeta).toContain("process.env.APP_URL");
    expect(marketingMeta).toContain("LEGACY_PRODUCTION_ORIGIN");
  });

  it("keeps customer sign-in callback paths stable while deriving their origin from APP_URL", () => {
    const authOAuth = read("src/routes/auth-oauth-routes.ts");
    expect(authOAuth).toContain('import { getCanonicalAppUrl } from "../lib/app-url"');
    expect(authOAuth).toContain("return getCanonicalAppUrl()");
    for (const path of [
      "/api/auth/google/callback",
      "/api/auth/microsoft/callback",
      "/api/auth/yahoo/callback",
    ]) {
      expect(authOAuth, path).toContain(path);
    }
    expect(authOAuth).not.toContain("https://trywireline.com/api/auth/");
  });

  it("keeps every active integration callback path hostname-neutral and represented in the operator inventory", () => {
    const inventory = read("scripts/print-oauth-redirects.mjs");
    const callbackPaths = new Set<string>();

    for (const file of INTEGRATION_ROUTE_FILES) {
      const source = read(file);
      const matches = [...source.matchAll(/\/api\/oauth\/[a-z0-9-]+\/callback/g)].map(
        (match) => match[0],
      );
      expect(matches.length, `${file} must expose an explicit callback path`).toBeGreaterThan(0);
      expect(source, `${file} must not pin the retired hostname into its callback`).not.toContain(
        "https://trywireline.com/api/oauth/",
      );
      expect(source, `${file} must not pin a future BotBound hostname into source`).not.toMatch(
        /https:\/\/[^\s"'`]*botbound[^\s"'`]*/i,
      );
      for (const path of matches) callbackPaths.add(path);
    }

    for (const path of callbackPaths) {
      expect(inventory, `operator OAuth inventory is missing ${path}`).toContain(path);
    }
    for (const path of [
      "/api/auth/google/callback",
      "/api/auth/microsoft/callback",
      "/api/auth/yahoo/callback",
    ]) {
      expect(inventory, `operator sign-in inventory is missing ${path}`).toContain(path);
    }
    expect(inventory).toContain("process.env.APP_URL");
    expect(inventory).toContain("BotBound");
  });
});
