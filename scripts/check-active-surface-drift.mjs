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
  [/--wl-page:\s*#f8f9ff/i, "must use Ametrine Precision root surface #f8f9ff"],
  [/--wl-primary:\s*#451ebb/i, "must use Ametrine Precision pressed primary #451ebb"],
  [/--wl-primary-container:\s*#5d3fd3/i, "must use Ametrine Precision action container #5d3fd3"],
  [/--wl-accent:\s*var\(--wl-primary-container\)/i, "must route web accent through the Ametrine primary-container token"],
  [/--wl-on-surface:\s*#0b1c30/i, "must use #0b1c30 as primary readable text"],
  [/--wl-surface-subtle:\s*#eff4ff/i, "must use #eff4ff secondary surfaces"],
  [/--wl-line:\s*#c9c4d7/i, "must use #c9c4d7 precision dividers"],
  [/--radius:\s*0\.25rem/i, "must retain 4px default geometry"],
  [/--radius-lg:\s*0\.5rem/i, "must retain 8px large-container geometry"],
  [/border-radius:\s*var\(--radius\)/i, "must use default geometry for standard controls"],
  [/transform:\s*scale\(0\.98\)/i, "must retain tactile 0.98 press feedback"],
  [/focus-visible[\s\S]*outline:\s*2px solid var\(--wl-accent\)/i, "must retain a 2px keyboard focus indicator"],
]);
if (/#f9f9f7|#1a3c34|#01261f|#003ec7|#0052ff|#f9f9ff|Professional Heritage|Wireline Precision|Signal Blue/i.test(foundation)) {
  report("src/styles/foundation.css", "must not retain retired Professional Heritage or Signal Blue tokens");
}

const indexCss = read("src/index.css");
requirePatterns("src/index.css", indexCss, [
  [/family=Inter/i, "must load Inter for Ametrine Precision hierarchy and dense content"],
  [/family=Hanken\+Grotesk/i, "must load Hanken Grotesk for display headings"],
  [/family=JetBrains\+Mono/i, "must load JetBrains Mono for metadata"],
  [/--wl-font-display:\s*\"?Hanken Grotesk\"?/i, "must map display typography to Hanken Grotesk"],
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
  [/canvas\s*=\s*Color\(hex:\s*0xF8F9FF\)/, "must use #F8F9FF native root canvas"],
  [/text\s*=\s*Color\(hex:\s*0x0B1C30\)/, "must use #0B1C30 primary text"],
  [/primary\s*=\s*Color\(hex:\s*0x451EBB\)/, "must expose #451EBB native pressed primary"],
  [/primaryContainer\s*=\s*Color\(hex:\s*0x5D3FD3\)/, "must expose #5D3FD3 native action container"],
  [/accent\s*=\s*primaryContainer/, "must route native accent through the Ametrine primary-container token"],
  [/border\s*=\s*Color\(hex:\s*0xC9C4D7\)/, "must use #C9C4D7 native borders"],
  [/scaleEffect\(configuration\.isPressed\s*\?\s*0\.98\s*:\s*1\)/, "must retain 0.98 tactile press feedback"],
]);

const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
requirePatterns("ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget, [
  [/accent = "5D3FD3"/, "must use the Ametrine Precision widget accent"],
  [/canvas = "F8F9FF"/, "must use the Ametrine Precision widget canvas"],
]);

const androidTheme = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt", androidTheme, [
  [/Canvas\s*=\s*Color\(0xFFF8F9FF\)/, "must use #F8F9FF Android root canvas"],
  [/Text\s*=\s*Color\(0xFF0B1C30\)/, "must use #0B1C30 Android primary text"],
  [/Primary\s*=\s*Color\(0xFF451EBB\)/, "must expose #451EBB Android pressed primary"],
  [/PrimaryContainer\s*=\s*Color\(0xFF5D3FD3\)/, "must expose #5D3FD3 Android action container"],
  [/Accent\s*=\s*PrimaryContainer/, "must route Android accent through the Ametrine primary-container token"],
  [/Border\s*=\s*Color\(0xFFC9C4D7\)/, "must use #C9C4D7 Android borders"],
  [/RadiusLg\s*=\s*8\.dp/, "must retain 8dp large-container geometry"],
]);

const androidWidget = read("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt", androidWidget, [
  [/Canvas\s*=\s*Color\(0xFFF8F9FF\)/, "must use #F8F9FF widget canvas"],
  [/Accent\s*=\s*Color\(0xFF5D3FD3\)/, "must use #5D3FD3 widget action color"],
]);

const designContract = spawnSync(process.execPath, [resolve(root, "scripts/check-design-system-contract.mjs")], {
  stdio: "inherit",
});
if (designContract.status !== 0) {
  report("scripts/check-design-system-contract.mjs", "design-system contract check failed");
}

const atomicCompletionContract = spawnSync(
  process.execPath,
  [resolve(root, "scripts/check-atomic-design-completion.mjs")],
  { stdio: "inherit" },
);
if (atomicCompletionContract.status !== 0) {
  report("scripts/check-atomic-design-completion.mjs", "Atomic Design completion contract check failed");
}

const commandPaletteContract = spawnSync(process.execPath, [resolve(root, "scripts/check-command-palette-contract.mjs")], {
  stdio: "inherit",
});
if (commandPaletteContract.status !== 0) {
  report("scripts/check-command-palette-contract.mjs", "command-palette contract check failed");
}

if (failures.length) {
  console.error("Ametrine Precision contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Ametrine Precision contract check passed");
}
