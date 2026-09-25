import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const customerUrlProducers = [
  "src/lib/browser-handoff-token.ts",
  "src/lib/email-compliance.ts",
  "src/lib/email-service.ts",
  "src/lib/job-worker-base.ts",
  "src/lib/mcp-oauth-security.ts",
  "src/lib/safe-public-text-fetch.ts",
  "src/lib/shareable-artifact/service.ts",
  "src/lib/showcase-assistant.ts",
  "src/lib/twilio-message-reliability.ts",
  "src/lib/voice/native-phone-carrier.ts",
  "src/lib/voice/openai-sip-config.ts",
  "src/routes/auth-routes.ts",
  "src/routes/billing-routes.ts",
  "src/routes/meta-webhook-routes.ts",
  "src/routes/openai-inbound-twilio-routes.ts",
  "src/routes/openai-sip-routes.ts",
  "src/routes/team-routes.ts",
] as const;

describe("canonical BotBound runtime origins", () => {
  it("never silently emits new customer links or provider callbacks on the legacy origin", () => {
    for (const path of customerUrlProducers) {
      expect(read(path), path).not.toContain("https://trywireline.com");
    }
  });

  it("uses the shared resolver for environment-specific links and the brand constant for fixed public links", () => {
    for (const path of [
      "src/lib/browser-handoff-token.ts",
      "src/lib/email-compliance.ts",
      "src/lib/job-worker-base.ts",
      "src/lib/shareable-artifact/service.ts",
      "src/lib/twilio-message-reliability.ts",
      "src/lib/voice/native-phone-carrier.ts",
      "src/lib/voice/openai-sip-config.ts",
    ]) {
      expect(read(path), path).toContain("getCanonicalAppUrl");
    }

    for (const path of [
      "src/lib/email-service.ts",
      "src/lib/mcp-oauth-security.ts",
      "src/routes/auth-routes.ts",
      "src/routes/billing-routes.ts",
      "src/routes/team-routes.ts",
    ]) {
      expect(read(path), path).toContain("resolveCanonicalAppUrl");
    }

    for (const path of [
      "src/lib/safe-public-text-fetch.ts",
      "src/routes/meta-webhook-routes.ts",
    ]) {
      expect(read(path), path).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    }
  });

  it("retains explicit origin migration compatibility without rebranding the verified mailbox", () => {
    expect(read("src/lib/brand.ts")).toContain('legacyProductionOrigin: "https://trywireline.com"');
    expect(read("src/lib/demo-funnel.ts")).toContain("LEGACY_PRODUCTION_ORIGIN");

    const support = [
      read("src/data/wireline-knowledge.ts"),
      read("src/routes/support-routes.ts"),
      read("src/components/SupportPage.tsx"),
    ].join("\n");
    expect(support).toContain("support@botbound.app");
    expect(support).not.toContain("support@trywireline.com");
  });
});
