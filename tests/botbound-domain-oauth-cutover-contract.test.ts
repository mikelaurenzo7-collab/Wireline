import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const STATIC_INTEGRATION_CALLBACKS = {
  "src/routes/oauth/google.ts": "/api/oauth/google/callback",
  "src/routes/oauth/google-sheets.ts": "/api/oauth/google_sheets/callback",
  "src/routes/oauth/microsoft.ts": "/api/oauth/microsoft/callback",
  "src/routes/oauth/yahoo.ts": "/api/oauth/yahoo/callback",
  "src/routes/oauth/salesforce.ts": "/api/oauth/salesforce/callback",
  "src/routes/oauth/hubspot.ts": "/api/oauth/hubspot/callback",
  "src/routes/oauth/apollo.ts": "/api/oauth/apollo/callback",
  "src/routes/oauth/meta.ts": "/api/oauth/meta/callback",
  "src/routes/oauth/shopify.ts": "/api/oauth/shopify/callback",
  // Square is a deliberate compatibility exception: this exact path is what
  // is already registered in the Square Developer Dashboard.
  "src/routes/oauth/square.ts": "/api/ecommerce/oauth/callback",
  "src/routes/oauth/slack.ts": "/api/oauth/slack/callback",
  "src/routes/oauth/x.ts": "/api/oauth/x/callback",
  "src/routes/oauth/zoom.ts": "/api/oauth/zoom/callback",
} as const;

const SIGN_IN_CALLBACKS = [
  "/api/auth/google/callback",
  "/api/auth/microsoft/callback",
  "/api/auth/yahoo/callback",
] as const;

const MICROSOFT_GRAPH_CALLBACKS = [
  "/api/oauth/microsoft_teams/callback",
  "/api/oauth/microsoft_excel/callback",
] as const;

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
    for (const path of SIGN_IN_CALLBACKS) expect(authOAuth, path).toContain(path);
    expect(authOAuth).not.toContain("https://trywireline.com/api/auth/");
  });

  it("keeps every active integration callback hostname-neutral and represented in the operator inventory", () => {
    const inventory = read("scripts/print-oauth-redirects.mjs");

    for (const [file, callback] of Object.entries(STATIC_INTEGRATION_CALLBACKS)) {
      const source = read(file);
      expect(source, `${file} must retain ${callback}`).toContain(callback);
      expect(source, `${file} must not pin the retired hostname into its callback`).not.toContain(
        "https://trywireline.com/api/oauth/",
      );
      expect(source, `${file} must not pin a future BotBound hostname into source`).not.toMatch(
        /https:\/\/[^\s"'`]*botbound[^\s"'`]*/i,
      );
      expect(inventory, `operator OAuth inventory is missing ${callback}`).toContain(callback);
    }

    const graph = read("src/routes/oauth/microsoft-graph.ts");
    expect(graph).toContain('return `${baseUrl}/api/oauth/${provider}/callback`');
    expect(graph).toContain('provider === "microsoft_teams"');
    for (const callback of MICROSOFT_GRAPH_CALLBACKS) {
      expect(inventory, `operator OAuth inventory is missing ${callback}`).toContain(callback);
    }

    for (const callback of SIGN_IN_CALLBACKS) {
      expect(inventory, `operator sign-in inventory is missing ${callback}`).toContain(callback);
    }
    expect(inventory).toContain("process.env.APP_URL");
    expect(inventory).toContain("BotBound");
  });
});
