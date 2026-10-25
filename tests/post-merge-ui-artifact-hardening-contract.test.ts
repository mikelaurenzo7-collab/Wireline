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
    expect(theme).toContain('light: "#F7F7F3"');
    expect(theme).toContain('dark: "#0A0A0E"');
  });

  it("keeps the complete environment template aligned with prepaid runtime billing", () => {
    const env = read(".env.example");

    expect(env).toContain("Usage draws from prepaid Runtime Balance.");
    expect(env).toContain(
      "Legacy packages do not use the separate pooled-usage Stripe meter above.",
    );
    expect(env).not.toContain("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME");
    expect(env).not.toContain("tenant overages bill through Stripe");
    expect(env).not.toContain("Cadence AI Stripe");
    expect(env).not.toContain("WIRELINE_LIVE_VIDEO_CATALOG_READY");

    for (const preservedKey of [
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
    expect(assets).toContain(
      "Free Builder, Starter, Starter Plus, and Pro. See live pricing for current capacity and rates.",
    );
    expect(assets).toContain("Start free at ${baseUrl.hostname}.");
    expect(assets).not.toContain("Start free at trywireline.com.");
    expect(assets).toContain("# BotBound official asset pack");
    expect(assets).toContain('path.join(marketingKit, "release-record.json")');
    expect(assets).toContain("releaseRecord.publishable !== true");
    expect(assets).toContain("const sourceCommit = resolveSourceCommit(repoRoot)");
    expect(assets.match(/assertCleanCheckout\(repoRoot, sourceCommit\)/g)).toHaveLength(2);
    expect(assets.match(/verifyRemoteSourceCommit\(sourceCommit, baseUrl\.origin\)/g)).toHaveLength(
      2,
    );
    expect(assets).toContain("copyExistingProductMedia(sourceCommit)");
    expect(assets).toContain("verifyCertifiedMediaRecord(frames[0]");
    expect(assets).toContain("verifyCertifiedMediaRecord(records[0]");
    expect(assets).toContain("Expected exactly 3 certified launch videos");
    expect(assets).toContain("verifiedBytes");
    expect(assets).not.toContain("copyFile(");
    for (const id of [
      "reel-46s-master-walkthrough",
      "reel-30s-product-loop",
      "reel-15s-missed-call",
    ]) {
      expect(assets).toContain(id);
    }
    expect(assets).not.toContain("copyIfExists");
    expect(assets).toContain("validatePreservedCampaignAudio");
    expect(assets).toContain("audioProvenanceMatches(audioPath, fingerprint)");
    expect(assets).toContain("campaignTrackFingerprintFromProvenance");
    expect(assets).toContain("readAudioProvenance(audioPath)");
    expect(assets).not.toContain("voiceId: DEFAULT_VOICE_ID");
    expect(assets).toContain("assertGeneratedMp3(");
    expect(assets).toContain("assertKnownOfficialAssetTopLevel");
    expect(assets).not.toContain('"visual-qa/');
    expect(assets).not.toContain("await rm(outRoot, { recursive: true, force: true })");
    expect(assets).not.toContain("as ${email}");
    expect(assets).not.toContain("# Wireline official asset pack");
    expect(assets).toContain("Your Bot for sales and support");
    expect(assets).not.toContain("Free Builder · Starter · Growth · Scale · Business");
    expect(assets).not.toContain("Your best salesperson, without the commission");
  });
});
