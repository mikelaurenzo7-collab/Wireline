import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const STATIC_INTEGRATION_CALLBACKS = {
  "src/routes/oauth/google.ts": "/api/oauth/google/callback",
  "src/routes/oauth/google-sheets.ts": "/api/oauth/google_sheets/callback",
  "src/routes/oauth/microsoft.ts": "/api/oauth/microsoft/callback",
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
  it("defers host-wide legacy redirects until signed provider callbacks are reconciled", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: Array<{
        source?: string;
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };
    const redirects = vercel.redirects ?? [];

    for (const host of ["trywireline.com", "www.trywireline.com"]) {
      const hostWideRedirect = redirects.find(
        (candidate) =>
          candidate.source === "/:path*" &&
          candidate.has?.some((condition) => condition.type === "host" && condition.value === host),
      );
      expect(
        hostWideRedirect,
        `${host} must keep signed callback URLs stable until provider inventory is certified`,
      ).toBeUndefined();
    }
  });

  it("keeps brand identity separate from the stable technical namespace", () => {
    const brand = read("src/lib/brand.ts");
    expect(brand).toContain('name: "BotBound"');
    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(brand).toContain('canonicalProductionOrigin: "https://botbound.me"');
    expect(brand).toContain('legacyProductionOrigin: "https://trywireline.com"');
    expect(brand).toContain('customerFacing: "BotBound"');
    expect(brand).toContain("canonicalOrigin: BOTBOUND_PRODUCTION_ORIGIN");
    expect(brand).toContain("legacyOrigin: LEGACY_PRODUCTION_ORIGIN");
  });

  it("keeps public BotBound metadata immutable and independent from the deferred callback origin", () => {
    const appUrl = read("src/lib/app-url.ts");
    const pageMeta = read("src/lib/page-meta.tsx");
    const marketingMeta = read("src/lib/marketing-route-meta.ts");
    const landing = read("src/pages/LandingPage.tsx");
    const prerender = read("scripts/prerender-marketing-meta.mts");
    const index = read("index.html");

    expect(appUrl).toContain("process.env.APP_URL");
    expect(appUrl).toContain('throw new Error("APP_URL is required in production")');
    expect(appUrl).toContain("APP_URL must be exactly");
    expect(appUrl).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    for (const source of [pageMeta, marketingMeta, landing]) {
      expect(source).toContain("BOTBOUND_PRODUCTION_ORIGIN");
      expect(source).not.toContain("LEGACY_PRODUCTION_ORIGIN");
      expect(source).not.toContain("VITE_PUBLIC_SITE_URL");
    }
    expect(marketingMeta).not.toContain("process.env.APP_URL");
    expect(prerender).not.toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(prerender).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(index).toContain('href="https://botbound.me/"');
    expect(index).not.toContain("https://trywireline.com");
  });

  it("keeps customer sign-in callback paths stable while deriving their origin from env", () => {
    const authOAuth = read("src/routes/auth-oauth-routes.ts");
    const appUrl = read("src/lib/app-url.ts");
    expect(authOAuth).toContain('import { getPublicRuntimeOrigin } from "../lib/app-url"');
    expect(authOAuth).toContain("return getPublicRuntimeOrigin(req)");
    expect(appUrl).toContain("process.env.APP_URL");
    expect(appUrl).toContain("process.env.PUBLIC_URL");
    expect(appUrl).toContain("RENDER_EXTERNAL_URL");
    expect(appUrl).toContain("getPublicRuntimeOrigin");
    expect(appUrl).toContain("envPublicRuntimeOrigin");
    expect(appUrl).not.toContain("x-forwarded-host");
    for (const path of SIGN_IN_CALLBACKS) expect(authOAuth, path).toContain(path);
    expect(authOAuth).not.toContain("https://trywireline.com/api/auth/");
    expect(authOAuth).not.toContain("https://botbound.me/api/auth/");
  });

  it("keeps every active integration callback hostname-neutral and represented in the operator inventory", () => {
    const inventory = read("scripts/print-oauth-redirects.mjs");

    for (const [file, callback] of Object.entries(STATIC_INTEGRATION_CALLBACKS)) {
      const source = read(file);
      expect(source, `${file} must retain ${callback}`).toContain(callback);
      expect(source, `${file} must not pin the retired hostname into its callback`).not.toContain(
        "https://trywireline.com/api/oauth/",
      );
      expect(
        source,
        `${file} must not pin the canonical BotBound hostname into route source`,
      ).not.toMatch(/https:\/\/[^\s"'`]*botbound\.me[^\s"'`]*/i);
      expect(inventory, `operator OAuth inventory is missing ${callback}`).toContain(callback);
    }

    const graph = read("src/routes/oauth/microsoft-graph.ts");
    expect(graph).toContain("return `${baseUrl}/api/oauth/${provider}/callback`");
    expect(graph).toContain('provider === "microsoft_teams"');
    for (const callback of MICROSOFT_GRAPH_CALLBACKS) {
      expect(inventory, `operator OAuth inventory is missing ${callback}`).toContain(callback);
    }

    for (const callback of SIGN_IN_CALLBACKS) {
      expect(inventory, `operator sign-in inventory is missing ${callback}`).toContain(callback);
    }
    expect(inventory).toContain("process.env.APP_URL");
    expect(inventory).toContain("BotBound");
    expect(inventory).not.toContain("VITE_PUBLIC_SITE_URL");
  });

  it("keeps Yahoo sign-in live while excluding the unfinished mailbox callback", () => {
    const yahoo = read("src/routes/oauth/yahoo.ts");
    const inventory = read("scripts/print-oauth-redirects.mjs");
    expect(yahoo).toContain("YAHOO_MAIL_CONNECTION_AVAILABLE = false");
    expect(yahoo).toContain("Yahoo Mail connection is not available");
    expect(inventory).toContain('["Yahoo sign-in", "/api/auth/yahoo/callback"]');
    expect(inventory).not.toContain('["Yahoo", "/api/oauth/yahoo/callback"]');
  });
});
