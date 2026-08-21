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

const customerSurfacePatterns = [
  "src/*.tsx",
  "src/components/**/*.tsx",
  "src/contexts/**/*.tsx",
  "src/pages/**/*.tsx",
  "src/data/**/*.ts",
  "src/entrypoints/**/*.ts",
  "src/hooks/**/*.ts",
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
  "chatgpt-app-submission.json",
  "claude-connector-submission.json",
  "index.html",
  "plugin.json",
  "server.ts",
] as const;

const compatibilityLinePatterns = [
  /legacyName:\s*"Wireline"/,
  /command@wireline\.com/,
  /https:\/\/github\.com\/mikelaurenzo7-collab\/Wireline/,
  /trywireline\.com/i,
] as const;

function withoutStableHeaderTokens(line: string): string {
  return line.replace(/X-Wireline-[A-Za-z-]+/g, "");
}

function isInternalLogLine(line: string): boolean {
  return /\b(?:log|logger|auditLogger)\.(?:debug|info|warn|error)\s*\(/.test(line);
}

function isPathScopedCompatibility(path: string, line: string): boolean {
  if (path === "src/lib/brand-text.ts") return true;
  if (path === "src/lib/google-sheets-service.ts") {
    return /LEGACY_(?:SHEET_TITLE|WIRELINE_NAME)/.test(line);
  }
  if (path === "src/lib/microsoft-graph-service.ts") {
    return /LEGACY_(?:EXCEL_FILE_NAME|WIRELINE_NAME)/.test(line);
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
  if (path === "src/lib/phone-provisioning.ts") {
    return (
      /friendlyName:\s*`Wireline · tenant /.test(line) ||
      /name:\s*`Wireline · \$\{userId\.slice/.test(line)
    );
  }
  if (path === "src/lib/vapi-phone-numbers.ts") {
    return /name:\s*opts\.name \|\| "Wireline-managed"/.test(line);
  }
  if (path === "src/lib/voice/xai-sip-session.ts") {
    return /ws\.close\(1000, "Wireline (?:transferred|line suspended|caller DNC|maximum duration reached)"\)/.test(
      line,
    );
  }
  if (path === "android/app/src/main/res/values/themes.xml") {
    return /Theme\.Wireline/.test(line);
  }
  if (path === "src/lib/studio-canvas-contract.ts") {
    return /pattern:\s*\/Wireline/.test(line);
  }
  if (path === "src/lib/soc2-controls.ts") {
    return /Wireline encrypted key prefix/.test(line);
  }
  if (path === "src/lib/internal-jwt-secret.ts") {
    return /canonical Wireline session secret/.test(line);
  }
  if (path === "src/lib/tcpa-consent.ts") {
    return /\/\/ Wireline policy: always disclose recording\./.test(line);
  }
  if (path === "src/lib/stripe-helpers.ts") {
    return (
      /(?:log\.error|throw new Error)\([^\n]*Wireline plan/.test(line) ||
      /multiple (?:current|incomplete) Wireline plan subscriptions/.test(line)
    );
  }
  if (path === "src/lib/ai-brains.ts") {
    return /You are (?:a senior call analyst|the Wireline Action Engine|the Wireline Agent Coach)/.test(
      line,
    );
  }
  if (path === "src/lib/env-validator.ts") {
    return /(?:Perplexity-first live public research for Wireline CEO agents|Wireline Environment Setup Checklist)/.test(
      line,
    );
  }
  if (path === "src/lib/launch-readiness.ts") {
    return /Launch hard gate is on and Wireline is not launch-ready/.test(line);
  }
  if (path === "src/lib/perplexity-platform.ts") {
    return /You are Wireline's live public-research tool/.test(line);
  }
  if (path === "src/routes/agent-routes-v2.ts") {
    return /You are the Wireline Configuration Engine/.test(line);
  }
  if (path === "src/lib/showcase-assistant.ts") return true;
  return false;
}

function isCompatibilityOnlyLine(path: string, line: string): boolean {
  return (
    isInternalLogLine(line) ||
    compatibilityLinePatterns.some((pattern) => pattern.test(line)) ||
    isPathScopedCompatibility(path, line)
  );
}

function visibleWirelineLeaksInSource(path: string, rawSource: string): string[] {
  const source = withoutComments(rawSource);
  const lines = source.split("\n");
  const leaks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scannableLine = withoutStableHeaderTokens(line);
    if (!/\bWireline\b/.test(scannableLine)) continue;
    if (isCompatibilityOnlyLine(path, scannableLine)) continue;
    leaks.push(`${path}:${index + 1} ${line.trim().replace(/\s+/g, " ").slice(0, 210)}`);
  }
  return leaks;
}

function visibleWirelineLeaks(path: string): string[] {
  return visibleWirelineLeaksInSource(path, read(path));
}

describe("BotBound visible-brand sweep", () => {
  it("strips stable header tokens without hiding retired display copy on the same line", () => {
    expect(
      visibleWirelineLeaksInSource(
        "synthetic.ts",
        'const header = "X-Wireline-Key"; const title = "Wireline API";',
      ),
    ).toHaveLength(1);
    expect(
      visibleWirelineLeaksInSource("synthetic.ts", 'const header = "X-Wireline-Key";'),
    ).toEqual([]);
  });

  it("does not leak the retired standalone Wireline customer name through web, native, static, API, or delivered text", () => {
    const files = customerSurfacePatterns
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .filter((file, index, all) => all.indexOf(file) === index)
      .sort();
    const leaks = files.flatMap(visibleWirelineLeaks);

    expect(
      leaks,
      `Customer-visible BotBound surfaces still contain the retired standalone Wireline name:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps technical compatibility identifiers explicit while requiring customer billing names to be BotBound", () => {
    const brand = read("src/lib/brand.ts");
    const openapi = read("src/lib/openapi-spec.ts");
    const nativeSip = read("src/lib/voice/xai-sip-config.ts");
    const webhooks = read("src/components/WebhooksManager.tsx");
    const firefox = read("apps/browser-extension/manifest.firefox.json");
    const catalog = read("src/lib/plan-catalog.ts");
    const sheets = read("src/lib/google-sheets-service.ts");
    const graph = read("src/lib/microsoft-graph-service.ts");
    const androidTheme = read("android/app/src/main/res/values/themes.xml");

    expect(brand).toContain('technicalNamespace: "wireline"');
    expect(brand).toContain('legacyName: "Wireline"');
    expect(openapi).toContain('name: "X-Wireline-Key"');
    expect(nativeSip).toContain('XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token"');
    expect(nativeSip).toContain('XAI_TWILIO_TRUNK_FRIENDLY_NAME = "Wireline · xAI Direct SIP"');
    expect(webhooks).toContain("X-Wireline-Signature");
    expect(firefox).toContain('"id": "command@wireline.com"');
    expect(catalog).toContain('name: "BotBound Starter"');
    expect(catalog).not.toContain('name: "Wireline Starter"');
    expect(sheets).toContain('const SHEET_TITLE = "BotBound Call Log"');
    expect(sheets).toContain("const LEGACY_SHEET_TITLE = `${LEGACY_WIRELINE_NAME} Call Log`");
    expect(graph).toContain('const EXCEL_FILE_NAME = "BotBound Call Log.xlsx"');
    expect(graph).toContain(
      "const LEGACY_EXCEL_FILE_NAME = `${LEGACY_WIRELINE_NAME} Call Log.xlsx`",
    );
    expect(androidTheme).toContain('name="Theme.Wireline"');
  });

  it("normalizes the raw partner OpenAPI document to BotBound without renaming its API-key header", () => {
    const runtime = read("src/lib/openapi-managed-runtime.ts");
    const routes = read("src/routes/openapi-routes.ts");
    expect(runtime).toContain('import { normalizeCustomerBrandDeep } from "./brand-text"');
    expect(runtime).toContain('preserve: ["X-Wireline-Key"]');
    expect(routes).toContain("normalizeOpenApiForManagedRuntime(getOpenApiSpec(");
  });

  it("keeps connected-app MCP responses BotBound without renaming tool, protocol, or tenant identifiers", () => {
    const registry = read("src/server/register-mcp-routes.ts");
    expect(registry).toContain("normalizePlatformBrandPhrases");
    expect(registry).toContain("normalizePlatformBrandPhrasesDeep");
    expect(registry).toContain("function mcpBrandResponseNormalizer");
    expect(registry).toContain("normalizePlatformBrandPhrasesDeep(body)");
    expect(registry).toContain("normalizePlatformBrandPhrases(body)");
    expect(registry).toContain("app.use(mcpBrandResponseNormalizer)");
    expect(registry.indexOf("app.use(mcpBrandResponseNormalizer)")).toBeLessThan(
      registry.indexOf("app.use(chatgptMcpAccountRouter)"),
    );
  });

  it("keeps long-lived showcase provider payloads brand-safe throughout the rename", () => {
    const guard = read("src/lib/showcase-prompt-truth-guard.ts");
    const routes = read("src/server/register-api-routes.ts");
    expect(guard).toContain("LEGACY_DEMO_MARKER");
    expect(guard).toContain("BOTBOUND_DEMO_MARKER");
    expect(guard).toContain("migrateShowcaseIdentityFields");
    expect(guard).toContain("isCapacityAssistant");
    expect(routes).toContain('app.use("/api/vapi-webhook", showcasePromptTruthGuard)');
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

  it("uses real shipped Inter Tight weights for the BotBound display hierarchy", () => {
    const fonts = read("public/fonts.css");
    const typography = withoutComments(read("src/styles/typography-prose.css"));
    const identity = withoutComments(read("src/styles/brand-identity.css"));

    for (const weight of [500, 600, 700]) {
      expect(fonts).toContain(
        `font-family: 'Inter Tight';\n  font-style: normal;\n  font-weight: ${weight};`,
      );
    }
    expect(typography).not.toMatch(/\.wl-display-[1-4]\s*\{[^}]*font-weight:\s*400/s);
    expect(typography).toMatch(/\.wl-display-1\s*\{[^}]*font-weight:\s*500/s);
    expect(typography).toMatch(/\.wl-display-3\s*\{[^}]*font-weight:\s*600/s);
    expect(typography).toMatch(/\.wl-page-title\s*\{[^}]*font-weight:\s*700/s);
    expect(identity).toMatch(/\.bb-wordmark\s*\{[^}]*font-weight:\s*800/s);
  });
});
