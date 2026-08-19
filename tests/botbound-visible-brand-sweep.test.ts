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
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*\/\/\/.*$/gm, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
}

/**
 * Customer-delivery surfaces, not implementation identifiers. The regex below
 * intentionally matches only standalone `Wireline`, so names such as
 * WirelineAndroidApp, com.wireline.app, data-wireline-*, WIRELINE_* env vars,
 * and wireline_* database identifiers remain compatible without whitelisting.
 */
const customerSurfacePatterns = [
  "src/components/**/*.tsx",
  "src/pages/**/*.tsx",
  "src/data/**/*.ts",
  "src/lib/**/*.ts",
  "src/routes/**/*.ts",
  "api/**/*.ts",
  "apps/browser-extension/**/*.{html,js,json}",
  "android/app/src/main/**/*.kt",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/res/values/*.xml",
  "ios/Wireline/**/*.swift",
  "ios/Wireline/Info.plist",
  "ios/WirelineWidgets/**/*.{swift,plist}",
  "public/**/*.{html,json,svg,xml,txt}",
  "index.html",
  "server.ts",
] as const;

/** Stable compatibility strings whose rename would break installed clients or today's origin. */
const compatibilityLinePatterns = [
  /legacyName:\s*"Wireline"/,
  /X-Wireline-Key/,
  /X-Wireline-Token/,
  /X-Wireline-Signature/,
  /X-Wireline-Demo-Max-Seconds/,
  /command@wireline\.com/,
  /https:\/\/github\.com\/mikelaurenzo7-collab\/Wireline/,
  /trywireline\.com/i,
] as const;

/**
 * Existing provider/catalog resource identities are deliberately frozen during
 * the brand migration. They are not presentation strings: code uses them to
 * reconcile already-created Stripe/Twilio/Vapi/xAI resources. BotBound must be
 * layered above them rather than reprovisioning or losing linkage.
 */
function isPathScopedCompatibility(path: string, line: string): boolean {
  if (path === "src/lib/plan-catalog.ts") {
    return /name:\s*"Wireline (?:Free Builder|Starter|Starter Plus|Pro|Business)"/.test(line);
  }
  if (path === "src/lib/voice-pricing-display.ts") {
    return /plan\.name\.replace\("Wireline ", ""\)/.test(line);
  }
  if (path === "src/lib/voice/xai-sip-config.ts") {
    return /XAI_TWILIO_TRUNK_FRIENDLY_NAME\s*=\s*"Wireline · xAI Direct SIP"/.test(line);
  }
  if (path === "src/lib/voice/xai-sip-provisioning.ts") {
    return /name:\s*`Wireline(?: voice)? · \$\{input\.phoneNumber\}`/.test(line);
  }
  if (path === "src/lib/voice/native-phone-carrier.ts") {
    return /friendlyName\s*=\s*`Wireline native /.test(line);
  }
  if (path === "src/lib/vapi-phone-numbers.ts") {
    return /name:\s*opts\.name \|\| "Wireline-managed"/.test(line);
  }
  if (path === "src/lib/studio-canvas-contract.ts") {
    return /pattern:\s*\/Wireline/.test(line);
  }
  if (path === "src/lib/soc2-controls.ts") {
    return /Wireline encrypted key prefix/.test(line);
  }
  if (path === "src/lib/stripe-helpers.ts") {
    return /(?:log\.error|throw new Error)\([^\n]*Wireline plan/.test(line) ||
      /multiple (?:current|incomplete) Wireline plan subscriptions/.test(line);
  }
  return false;
}

function isCompatibilityOnlyLine(path: string, line: string): boolean {
  return (
    compatibilityLinePatterns.some((pattern) => pattern.test(line)) ||
    isPathScopedCompatibility(path, line)
  );
}

function visibleWirelineLeaks(path: string): string[] {
  const source = withoutComments(read(path));
  const lines = source.split("\n");
  const leaks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\bWireline\b/.test(line)) continue;
    if (isCompatibilityOnlyLine(path, line)) continue;
    leaks.push(`${path}:${index + 1} ${line.trim().replace(/\s+/g, " ").slice(0, 210)}`);
  }
  return leaks;
}

describe("BotBound visible-brand sweep", () => {
  it("does not leak the retired standalone Wireline customer name through web, native, static, API, or delivered text", () => {
    const files = customerSurfacePatterns
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .map((file) => file.replaceAll("\\", "/"))
      // Contract tests are evidence, not customer-delivery surfaces. They may
      // explicitly mention legacy identifiers to prove compatibility behavior.
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .filter((file, index, all) => all.indexOf(file) === index)
      .sort();
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
    const catalog = read("src/lib/plan-catalog.ts");

    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(openapi).toContain('name: "X-Wireline-Key"');
    expect(nativeSip).toContain('XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token"');
    expect(webhooks).toContain("X-Wireline-Signature");
    expect(firefox).toContain('"id": "command@wireline.com"');
    expect(catalog).toContain('name: "Wireline Starter"');
  });

  it("keeps BotBound explicit in canonical brand, metadata, shell, install, native, and billing surfaces", () => {
    for (const path of [
      "src/lib/brand.ts",
      "src/lib/page-meta.tsx",
      "src/components/WorkspaceShell.tsx",
      "src/components/brand/BotBoundBrand.tsx",
      "src/components/brand/BotBoundMark.tsx",
      "src/lib/resend-config.ts",
      "index.html",
      "public/site.webmanifest",
      "public/botbound-icon.svg",
      "public/botbound-stripe-logo.svg",
      "android/app/src/main/res/values/strings.xml",
      "ios/Wireline/Info.plist",
      "ios/WirelineWidgets/Info.plist",
    ]) {
      expect(read(path), path).toContain("BotBound");
    }
  });
});
