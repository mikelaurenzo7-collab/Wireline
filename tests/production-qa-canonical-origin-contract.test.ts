import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production dogfood and QA canonical origin", () => {
  it("hard-locks every credential-bearing capture and reset path to botbound.me", () => {
    const authority = read("scripts/dogfood-credentials.mjs");
    expect(authority).toContain(
      'import { CANONICAL_PRODUCTION_URL } from "./lib/production-url.mjs"',
    );
    expect(authority).toContain("CANONICAL_DOGFOOD_ORIGIN = CANONICAL_PRODUCTION_URL");

    for (const path of [
      "scripts/prod-dogfood.mjs",
      "scripts/dogfood-reset.mjs",
      "scripts/build-official-assets.mjs",
      "scripts/marketing-kit.mjs",
    ]) {
      const source = read(path);
      expect(source, path).toContain("requireCanonicalCredentialTarget");
      expect(source, path).not.toContain('"https://trywireline.com"');
    }
  });

  it("defaults public launch and non-credentialed production QA to botbound.me", () => {
    const publicDogfood = read("scripts/dogfood-marketing.mjs");
    const productionVisualQa = read("scripts/capture-prod-visual-qa.mjs");
    const appReleaseQa = read("scripts/check-chatgpt-app-release.mjs");
    const campaignVo = read("scripts/generate-campaign-vo.mjs");
    const officialAssets = read("scripts/build-official-assets.mjs");

    expect(publicDogfood).toContain("process.env.APP_URL || CANONICAL_PRODUCTION_URL");
    expect(productionVisualQa).toContain(
      'process.env.WIRELINE_VISUAL_BASE_URL || "https://botbound.me"',
    );
    expect(appReleaseQa).toContain(
      "explicitUrl || process.env.APP_URL || CANONICAL_PRODUCTION_URL",
    );
    expect(campaignVo).toContain("Build free at botbound.me.");
    expect(officialAssets).toContain("Start free at ${baseUrl.hostname}.");
  });

  it("keeps legacy host use explicit and preserves the established support mailbox", () => {
    const productionUrl = read("scripts/lib/production-url.mjs");
    const appReleaseQa = read("scripts/check-chatgpt-app-release.mjs");
    const measurementQa = read("scripts/check-marketing-measurement-consent.mjs");
    const stripeIdentity = read("scripts/lib/stripe-account-identity.mjs");

    expect(productionUrl).toContain(
      'export const LEGACY_COMPATIBILITY_URL = "https://trywireline.com"',
    );
    expect(appReleaseQa).toContain("const legacyMcpEndpoint = `${LEGACY_COMPATIBILITY_URL}/mcp`");
    expect(measurementQa).toContain('window.location.hostname === "trywireline.com"');
    expect(stripeIdentity).toContain('"support@trywireline.com"');
  });
});
