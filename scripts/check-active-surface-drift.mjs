import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ametrine Precision contract.
 * This intentionally guards the shared foundations and actual application shells,
 * not speculative screenshots or one-off design artifacts.
 */
const root = process.cwd();
const coreFiles = [
  "src/index.css",
  "src/styles/foundation.css",
  "src/styles/design-system.css",
  "src/components/WorkspaceShell.tsx",
  "src/pages/OverviewPage.tsx",
  "src/routes/AppRoutes.tsx",
  "ios/Wireline/Theme/WirelineTheme.swift",
  "ios/WirelineShared/WirelineWidgetSnapshot.swift",
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt",
  "android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt",
];

const failures = [];
const filePath = (file) => resolve(root, file);
const read = (file) => readFileSync(filePath(file), "utf8");
const report = (file, message) => failures.push(`${file}: ${message}`);
const requireFile = (file) => {
  if (!existsSync(filePath(file))) {
    report(file, "required Ametrine Precision surface is missing");
    return false;
  }
  return true;
};
const requirePatterns = (file, source, checks) => {
  for (const [pattern, message] of checks) {
    if (!pattern.test(source)) report(file, message);
  }
};

for (const file of coreFiles) requireFile(file);

const foundation = read("src/styles/foundation.css");
requirePatterns("src/styles/foundation.css", foundation, [
  [/--wl-page:\s*var\(--wireline-color-canvas-default\)/i, "must route root canvas through generated semantic tokens"],
  [/--wl-primary:\s*var\(--wireline-color-action-primary-pressed\)/i, "must route pressed primary through generated semantic tokens"],
  [/--wl-primary-container:\s*var\(--wireline-color-action-primary-default\)/i, "must route action container through generated semantic tokens"],
  [/--wl-accent:\s*var\(--wireline-color-action-primary-default\)/i, "must route web accent through generated semantic tokens"],
  [/--wl-on-surface:\s*var\(--wireline-color-text-primary\)/i, "must route readable text through generated semantic tokens"],
  [/--wl-surface-subtle:\s*var\(--wireline-color-surface-subtle\)/i, "must route secondary surfaces through generated semantic tokens"],
  [/--wl-line:\s*var\(--wireline-color-border-default\)/i, "must route dividers through generated semantic tokens"],
  [/--wl-overlay-scrim:\s*var\(--wireline-color-overlay-scrim\)/i, "must route overlays through generated semantic tokens"],
  [/--wl-shadow-md:\s*var\(--wireline-elevation-md\)/i, "must route elevation through generated semantic tokens"],
  [/--wl-target-minimum:\s*var\(--wireline-interaction-target-minimum\)/i, "must expose the minimum interaction target token"],
  [/--focus-ring:\s*var\(--wireline-interaction-focus-width\) solid var\(--wireline-color-focus-default\)/i, "must route keyboard focus through generated semantic tokens"],
  [/border-radius:\s*var\(--radius\)/i, "must use default geometry for standard controls"],
  [/transform:\s*var\(--active-press\)/i, "must retain tactile press feedback through the motion token"],
]);
if (/#f9f9f7|#1a3c34|#01261f|#003ec7|#0052ff|Professional Heritage|Wireline Precision|Signal Blue/i.test(foundation)) {
  report("src/styles/foundation.css", "must not retain retired Professional Heritage or Signal Blue tokens");
}

const indexCss = read("src/index.css");
requirePatterns("src/index.css", indexCss, [
  [/family=Inter/i, "must load Inter for Ametrine Precision hierarchy and dense content"],
  [/family=Hanken\+Grotesk/i, "must load Hanken Grotesk for display headings"],
  [/family=JetBrains\+Mono/i, "must load JetBrains Mono for metadata"],
  [/--wl-font-display:\s*"?Hanken Grotesk"?/i, "must map display typography to Hanken Grotesk"],
  [/--wl-font-sans:\s*Inter/i, "must map body typography to Inter"],
]);
if (/Professional Heritage|#1A3C34|#F9F9F7/i.test(indexCss)) {
  report("src/index.css", "must not retain retired typography or forest palette declarations");
}

const shell = read("src/components/WorkspaceShell.tsx");
requirePatterns("src/components/WorkspaceShell.tsx", shell, [
  [/w-\[256px\]/, "must use the 256px Ametrine Precision workspace shell"],
  [/lg:grid-cols-\[256px_minmax\(0,1fr\)\]/, "must use the 256px desktop workspace grid"],
  [/label: "Overview"/, "must expose Overview in primary navigation"],
  [/label: "Inbox"/, "must expose Inbox in primary navigation"],
  [/label: "Connections"/, "must expose Connections in primary navigation"],
]);

const routes = read("src/routes/AppRoutes.tsx");
requirePatterns("src/routes/AppRoutes.tsx", routes, [
  [/path="\/overview"/, "must route the new Workspace Overview"],
  [/path="\/inbox"/, "must route the active Inbox"],
  [/Navigate to="\/overview" replace/, "must default authenticated navigation to Overview"],
]);

const overview = read("src/pages/OverviewPage.tsx");
requirePatterns("src/pages/OverviewPage.tsx", overview, [
  [/useAgents\(\)/, "must render real assistant state rather than mock dashboard data"],
  [/Create an assistant/, "must preserve a direct first-assistant action"],
  [/Connect useful actions|Connect your tools/, "must connect overview to real integration setup"],
]);

const iosTheme = read("ios/Wireline/Theme/WirelineTheme.swift");
requirePatterns("ios/Wireline/Theme/WirelineTheme.swift", iosTheme, [
  [/canvas\s*=\s*WirelineDesignTokens\.ColorToken\.colorCanvasDefault|canvas\s*=\s*Color\(hex:\s*0xF8F9FF\)/, "must delegate #F8F9FF native root canvas via tokens"],
  [/text\s*=\s*WirelineDesignTokens\.ColorToken\.colorTextPrimary|text\s*=\s*Color\(hex:\s*0x0B1C30\)/, "must delegate #0B1C30 primary text via tokens"],
  [/primary\s*=.*colorActionPrimary|primary\s*=\s*Color\(hex:\s*0x451EBB\)/, "must expose action primary via tokens"],
  [/primaryContainer\s*=.*colorActionPrimary|primaryContainer\s*=\s*Color\(hex:\s*0x5D3FD3\)/, "must expose #5D3FD3 native action container via tokens"],
  [/accent\s*=\s*primaryContainer|accent\s*=.*accentContainer/, "must route native accent through the Ametrine primary-container token"],
  [/border\s*=\s*WirelineDesignTokens\.ColorToken\.colorBorderDefault|border\s*=\s*Color\(hex:\s*0xC9C4D7\)/, "must delegate #C9C4D7 native borders via tokens"],
  [/scaleEffect|pressScale|0\.98/, "must retain 0.98 tactile press feedback via tokens"],
]);

const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
requirePatterns("ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget, [
  [/accent = "5D3FD3"/, "must use the Ametrine Precision widget accent"],
  [/canvas = "F8F9FF"/, "must use the Ametrine Precision widget canvas"],
]);

const androidTheme = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt", androidTheme, [
  [/Canvas\s*=\s*WirelineDesignTokens\.ColorToken\.colorCanvasDefault/, "must delegate #F8F9FF Android root canvas via tokens"],
  [/Text\s*=\s*WirelineDesignTokens\.ColorToken\.colorTextPrimary/, "must delegate #0B1C30 Android primary text via tokens"],
  [/Primary\s*=.*colorActionPrimary/, "must expose action primary (default/pressed) Android via tokens"],
  [/PrimaryContainer\s*=.*colorActionPrimary/, "must expose #5D3FD3 Android action container via tokens"],
  [/Accent\s*=\s*PrimaryContainer|Accent\s*=.*Accent/, "must route Android accent through the Ametrine primary-container token"],
  [/Border\s*=\s*WirelineDesignTokens\.ColorToken\.colorBorderDefault/, "must delegate #C9C4D7 Android borders via tokens"],
  [/RadiusLg\s*=\s*WirelineDesignTokens\.Metric\.radiusLg|RadiusLg\s*=\s*8\.dp/, "must retain 8dp large-container geometry via tokens"],
]);

const androidWidget = read("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt", androidWidget, [
  [/Canvas\s*=\s*Brand\.Canvas|Canvas\s*=\s*Color\(0xFFF8F9FF\)/, "must use #F8F9FF widget canvas (delegated)"],
  [/Accent\s*=\s*Brand\.Accent|Accent\s*=\s*Color\(0xFF5D3FD3\)/, "must use #5D3FD3 widget action color (delegated)"],
]);

// Ensure generated tokens file (single source for Android) carries the canonical values
const androidGenerated = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt", androidGenerated, [
  [/colorCanvasDefault = Color\(0xFFF8F9FF\)/, "generated must carry #F8F9FF canvas"],
  [/colorActionPrimaryDefault = Color\(0xFF5D3FD3\)/, "generated must carry #5D3FD3 primary"],
  [/colorBorderDefault = Color\(0xFFC9C4D7\)/, "generated must carry #C9C4D7 border"],
  [/radiusLg = 8\.dp/, "generated must carry 8dp radiusLg"],
]);

const tokenContract = spawnSync(process.execPath, [resolve(root, "scripts/check-design-token-contract.mjs")], { stdio: "inherit" });
if (tokenContract.status !== 0) report("scripts/check-design-token-contract.mjs", "semantic token contract check failed");

const designContract = spawnSync(process.execPath, [resolve(root, "scripts/check-design-system-contract.mjs")], { stdio: "inherit" });
if (designContract.status !== 0) report("scripts/check-design-system-contract.mjs", "design-system contract check failed");

const atomicCompletionContract = spawnSync(process.execPath, [resolve(root, "scripts/check-atomic-design-completion.mjs")], { stdio: "inherit" });
if (atomicCompletionContract.status !== 0) report("scripts/check-atomic-design-completion.mjs", "Atomic Design completion contract check failed");

const commandPaletteContract = spawnSync(process.execPath, [resolve(root, "scripts/check-command-palette-contract.mjs")], { stdio: "inherit" });
if (commandPaletteContract.status !== 0) report("scripts/check-command-palette-contract.mjs", "command-palette contract check failed");

if (failures.length) {
  console.error("Ametrine Precision contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Ametrine Precision contract check passed");
}
