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
    leaks.push(`${path}:${index + 1} ${line.trim().replace(/\s+/g, " ").slice(0, 210)}`);
  }
  return leaks;
}

describe("BotBound visible-brand sweep", () => {
  it("does not leak the retired standalone Wireline customer name through web, native, static, API, or delivered text", () => {
    const files = customerSurfacePatterns
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .map((file) => file.replaceAll("\\", "/"))
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

    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(openapi).toContain('name: "X-Wireline-Key"');
    expect(nativeSip).toContain('XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token"');
    expect(webhooks).toContain("X-Wireline-Signature");
    expect(firefox).toContain('"id": "command@wireline.com"');
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
