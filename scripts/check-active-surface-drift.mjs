import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wireline Precision contract.
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
    report(file, "required Wireline Precision surface is missing");
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
  [/--wl-page:\s*#f9f9ff/i, "must use Wireline Precision root surface #f9f9ff"],
  [/--wl-accent:\s*#003ec7/i, "must use Wireline Precision Signal Blue primary #003ec7"],
  [/--wl-on-surface:\s*#111c2d/i, "must use #111c2d as primary readable text"],
  [/--wl-surface-subtle:\s*#f0f3ff/i, "must use #f0f3ff secondary surfaces"],
  [/--wl-line:\s*#c3c5d9/i, "must use #c3c5d9 precision dividers"],
  [/--radius:\s*0\.5rem/i, "must retain 8px default geometry"],
  [/--radius-lg:\s*1rem/i, "must retain 16px large-container geometry"],
  [/border-radius:\s*var\(--radius\)/i, "must use 8px default geometry for standard controls and cards"],
  [/transform:\s*scale\(0\.98\)/i, "must retain tactile 0.98 press feedback"],
  [/focus-visible[\s\S]*outline:\s*2px solid var\(--wl-accent\)/i, "must retain a 2px keyboard focus indicator"],
]);
if (/#f9f9f7|#1a3c34|#01261f|Professional Heritage/i.test(foundation)) {
  report("src/styles/foundation.css", "must not retain retired Professional Heritage tokens");
}

const indexCss = read("src/index.css");
requirePatterns("src/index.css", indexCss, [
  [/family=Inter/i, "must load Inter for Wireline Precision hierarchy and dense content"],
  [/family=JetBrains\+Mono/i, "must load JetBrains Mono for metadata"],
  [/--wl-font-display:\s*Inter/i, "must map display typography to Inter"],
  [/--wl-font-sans:\s*Inter/i, "must map body typography to Inter"],
]);
if (/Professional Heritage|#1A3C34|#F9F9F7/i.test(indexCss)) {
  report("src/index.css", "must not retain retired typography or forest palette declarations");
}

const shell = read("src/components/WorkspaceShell.tsx");
requirePatterns("src/components/WorkspaceShell.tsx", shell, [
  [/w-\[256px\]/, "must use the 256px Wireline Precision workspace shell"],
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
  [/Connect your tools/, "must connect overview to real integration setup"],
]);

const iosTheme = read("ios/Wireline/Theme/WirelineTheme.swift");
requirePatterns("ios/Wireline/Theme/WirelineTheme.swift", iosTheme, [
  [/canvas\s*=\s*Color\(hex:\s*0xF9F9FF\)/, "must use #F9F9FF native root canvas"],
  [/text\s*=\s*Color\(hex:\s*0x111C2D\)/, "must use #111C2D primary text"],
  [/accent\s*=\s*Color\(hex:\s*0x003EC7\)/, "must use #003EC7 native action color"],
  [/border\s*=\s*Color\(hex:\s*0xC3C5D9\)/, "must use #C3C5D9 native borders"],
  [/scaleEffect\(configuration\.isPressed\s*\?\s*0\.98\s*:\s*1\)/, "must retain 0.98 tactile press feedback"],
]);

const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
requirePatterns("ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget, [
  [/accent = "003EC7"/, "must use the Wireline Precision widget accent"],
  [/canvas = "F9F9FF"/, "must use the Wireline Precision widget canvas"],
]);

const androidTheme = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt", androidTheme, [
  [/Canvas\s*=\s*Color\(0xFFF9F9FF\)/, "must use #F9F9FF Android root canvas"],
  [/Text\s*=\s*Color\(0xFF111C2D\)/, "must use #111C2D Android primary text"],
  [/Accent\s*=\s*Color\(0xFF003EC7\)/, "must use #003EC7 Android action color"],
  [/Border\s*=\s*Color\(0xFFC3C5D9\)/, "must use #C3C5D9 Android borders"],
  [/RadiusLg\s*=\s*16\.dp/, "must retain 16dp large-container geometry"],
]);

const androidWidget = read("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt", androidWidget, [
  [/Canvas\s*=\s*Color\(0xFFF9F9FF\)/, "must use #F9F9FF widget canvas"],
  [/Accent\s*=\s*Color\(0xFF003EC7\)/, "must use #003EC7 widget action color"],
]);

if (failures.length) {
  console.error("Wireline Precision contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Wireline Precision contract check passed");
}
