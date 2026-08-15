import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("post-merge UI and artifact hardening", () => {
  it("keeps browser chrome synchronized with the resolved Wireline appearance", () => {
    const index = read("index.html");
    const theme = read("src/contexts/ThemeContext.tsx");

    expect(index).toContain('<meta name="color-scheme" content="dark light" />');
    expect(theme).toContain('updateMetaContent("color-scheme", resolved)');
    expect(theme).toContain('updateMetaContent("theme-color", THEME_COLORS[resolved])');
    expect(theme).toContain('updateMetaContent("msapplication-TileColor", THEME_COLORS[resolved])');
    expect(theme).toContain('light: "#F6F5FA"');
    expect(theme).toContain('dark: "#0A0A0E"');
  });

  it("keeps the complete environment template aligned with prepaid runtime billing", () => {
    const env = read(".env.example");

    expect(env).toContain("Usage draws from prepaid Runtime Balance.");
    expect(env).toContain("No Stripe meter event is configured.");
    expect(env).not.toContain("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME");
    expect(env).not.toContain("tenant overages bill through Stripe");
    expect(env).not.toContain("Cadence AI Stripe");
    expect(env).not.toContain("WIRELINE_LIVE_VIDEO_CATALOG_READY");

    for (const preservedKey of [
      "WIRELINE_LIVE_VIDEO_DISABLED",
      "MCP_OAUTH_TOKEN_PEPPER",
      "UPSTASH_REDIS_REST_URL",
      "RESEND_API_KEY",
      "GOOGLE_CLIENT_ID",
      "HUBSPOT_CLIENT_ID",
      "META_APP_ID",
      "DOCUSIGN_ACCOUNT_ID",
      "SENTRY_DSN",
      "VITE_SUPABASE_URL",
      "E2E_USER_EMAIL",
    ]) {
      expect(env).toContain(`${preservedKey}=`);
    }
  });

  it("keeps official asset capture portable, fail-safe, and on current brand language", () => {
    const assets = read("scripts/build-official-assets.mjs");

    expect(assets).toContain(
      "const baseUrl = new URL(requireCanonicalCredentialTarget(process.env.E2E_BASE_URL))",
    );
    expect(assets).toContain("requireCompleteCredentialPair(");
    expect(assets).toContain("url: baseUrl.origin");
    expect(assets).toContain('secure: baseUrl.protocol === "https:"');
    expect(assets).toContain("try {\n    const context = await browser.newContext");
    expect(assets).toContain("finally {\n    await browser.close();");
    expect(assets).toContain("Free Builder, Starter, Starter Plus, and Pro. Scale is custom.");
    expect(assets).toContain("Voice agents for sales and support");
    expect(assets).not.toContain("Free Builder · Starter · Growth · Scale · Business");
    expect(assets).not.toContain("Your best salesperson, without the commission");
  });
});
