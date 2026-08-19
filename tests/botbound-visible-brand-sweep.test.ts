import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const customerSurfacePatterns = [
  "src/components/**/*.tsx",
  "src/pages/**/*.tsx",
  "apps/browser-extension/**/*.{html,js,json}",
] as const;

const customerDeliveryFiles = [
  "src/lib/chatgpt-mcp-account.ts",
  "src/lib/company-identity.ts",
  "src/lib/daily-brief.ts",
  "src/lib/demo-funnel.ts",
  "src/lib/email-compliance.ts",
  "src/lib/email-service.ts",
  "src/lib/integration-playbooks.ts",
  "src/lib/mcp-agent-coaching.ts",
  "src/lib/mcp-app-metadata.ts",
  "src/lib/mcp-oauth-security.ts",
  "src/lib/mcp-transport.ts",
  "src/lib/mobile-push.ts",
  "src/lib/openai-post-call-artifact.ts",
  "src/lib/openapi-spec.ts",
  "src/lib/owned-email-account.ts",
  "src/lib/phone-provisioning.ts",
  "src/lib/post-call-digest.ts",
  "src/lib/provider-http-error.ts",
  "src/lib/realtime-spend-reservation.ts",
  "src/lib/safe-public-text-fetch.ts",
  "src/lib/shared-workspace-readiness.ts",
  "src/lib/slack-service.ts",
  "src/lib/spend-guards.ts",
  "src/lib/stripe-checkout-branding.ts",
  "src/lib/stripe-portal-policy.ts",
  "src/lib/trial-gate.ts",
  "src/lib/twilio-webhook-privacy.ts",
  "src/lib/vapi-assistant-factory-v2.ts",
  "src/lib/vapi-tool-handlers.ts",
  "src/lib/voice-catalog.ts",
  "src/lib/voice-spend-control.ts",
  "src/lib/voice/native-phone-carrier.ts",
  "src/lib/voice/native-phone-release.ts",
  "src/lib/voice/openai-live-agent-service.ts",
  "src/lib/voice/openai-realtime-config.ts",
  "src/lib/voice/openai-realtime-service.ts",
  "src/lib/voice/openai-realtime-tools.ts",
  "src/lib/voice/xai-agent-runtime.ts",
  "src/lib/voice/xai-public-demo-session.ts",
  "src/lib/website-knowledge-spend.ts",
  "src/lib/xai-imagine-video.ts",
  "src/lib/shareable-artifact/brand.ts",
  "src/lib/shareable-artifact/publish-call-recap.ts",
  "src/lib/shareable-artifact/template/render-not-found.ts",
  "src/lib/shareable-artifact/template/shell.ts",
] as const;

/** Stable protocol/resource identifiers whose rename would break existing clients. */
const compatibilityLinePatterns = [
  /X-Wireline-Key/,
  /X-Wireline-Token/,
  /X-Wireline-Signature/,
  /command@wireline\.com/,
  /https:\/\/github\.com\/mikelaurenzo7-collab\/Wireline/,
  /trywireline\.com/i,
] as const;

function isCompatibilityOnlyLine(line: string): boolean {
  return compatibilityLinePatterns.some((pattern) => pattern.test(line));
}

function visibleWirelineLeaks(path: string): string[] {
  const source = withoutComments(read(path));
  const lines = source.split("\n");
  const leaks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\bWireline\b/.test(line)) continue;
    if (isCompatibilityOnlyLine(line)) continue;
    leaks.push(`${path}:${index + 1} ${line.trim().replace(/\s+/g, " ").slice(0, 190)}`);
  }
  return leaks;
}

describe("BotBound visible-brand sweep", () => {
  it("does not leak the retired standalone Wireline customer name through UI or delivered customer text", () => {
    const uiFiles = customerSurfacePatterns
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file, index, all) => all.indexOf(file) === index)
      .sort();
    const files = [...uiFiles, ...customerDeliveryFiles].filter(
      (file, index, all) => all.indexOf(file) === index,
    );
    const leaks = files.flatMap(visibleWirelineLeaks);

    expect(
      leaks,
      `Customer-visible BotBound surfaces still contain the retired standalone Wireline name:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps technical compatibility identifiers explicit and unchanged", () => {
    const brand = read("src/lib/brand.ts");
    const openapi = read("src/lib/openapi-spec.ts");
    const nativeSip = read("src/lib/voice/xai-sip-config.ts");
    const webhooks = read("src/components/WebhooksManager.tsx");
    const firefox = read("apps/browser-extension/manifest.firefox.json");

    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(openapi).toContain('name: "X-Wireline-Key"');
    expect(nativeSip).toContain('XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token"');
    expect(webhooks).toContain("X-Wireline-Signature");
    expect(firefox).toContain('"id": "command@wireline.com"');
  });

  it("keeps BotBound explicit in the canonical brand, metadata, shell, and install surfaces", () => {
    for (const path of [
      "src/lib/brand.ts",
      "src/lib/page-meta.tsx",
      "src/components/WorkspaceShell.tsx",
      "src/components/brand/BotBoundBrand.tsx",
      "src/components/brand/BotBoundMark.tsx",
      "index.html",
      "public/site.webmanifest",
      "public/botbound-icon.svg",
    ]) {
      expect(read(path), path).toContain("BotBound");
    }
  });
});
