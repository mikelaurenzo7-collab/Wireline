import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const oldPalette = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30|rgba\(93,\s*63,\s*211/i;

function pathFor(relativePath) {
  return resolve(root, relativePath);
}

function read(relativePath) {
  const path = pathFor(relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function mustInclude(file, source, pattern, message) {
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}

function mustExclude(file, source, pattern, message) {
  if (pattern.test(source)) failures.push(`${file}: ${message}`);
}

function mustBeDeleted(relativePath, message) {
  if (existsSync(pathFor(relativePath))) failures.push(`${relativePath}: ${message}`);
}

const packageJson = read("package.json");
const appRoutes = read("src/routes/AppRoutes.tsx");
const tokenSource = read("design-tokens/wireline.tokens.json");
const foundationCss = read("src/styles/foundation.css");
const designSystemCss = read("src/styles/design-system.css");
const studioOperationsCss = read("src/styles/studio-operations.css");
const workspaceShell = read("src/components/WorkspaceShell.tsx");
const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
const createDialog = read("src/components/CreateAgentDialog.tsx");
const studioWorkroom = read("src/components/StudioWorkroom.tsx");
const assetUpload = read("src/components/AgentAssetUpload.tsx");
const trainingPage = read("src/pages/KnowledgePage.tsx");
const knowledgeWorkspace = read("src/components/KnowledgeWorkspace.tsx");
const browserCallWidget = read("src/components/marketing/BrowserCallWidget.tsx");
const webTokens = read("src/styles/tokens.generated.css");
const browserTokens = read("apps/browser-extension/panel/tokens.generated.css");
const tokenConstants = read("src/constants/generated-design-tokens.ts");
const androidTokens = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt");
const iosTokens = read("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
const chatgptWidget = read("src/lib/chatgpt-mcp.ts");
const chatgptAccountWidget = read("src/lib/chatgpt-mcp-account.ts");
const legalCss = read("public/static-legal.css");
const manifest = read("public/site.webmanifest");
const publicIcon = read("public/wireline-icon.svg");
const favicon = read("public/favicon.svg");
const extensionIcon = read("apps/browser-extension/assets/icon.svg");
const androidLauncherBg = read("android/app/src/main/res/drawable/ic_launcher_background.xml");

mustInclude("package.json", packageJson, /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs"/, "design:check must run this file");
mustInclude("design-tokens/wireline.tokens.json", tokenSource, /"\$description"\s*:\s*"Wireline Mono design tokens/, "token source must describe Wireline Mono");
mustInclude("design-tokens/wireline.tokens.json", tokenSource, /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#111111"\s*\}/, "token source primary action must be #111111");
mustExclude("design-tokens/wireline.tokens.json", tokenSource, oldPalette, "token source must not contain old purple/blue palette");
mustInclude("src/styles/foundation.css", foundationCss, /color-scheme:\s*light/, "use one light scheme until a complete theme setting exists");
mustInclude("src/styles/foundation.css", foundationCss, /overflow:\s*hidden/, "outer viewport must stay locked");
mustInclude("src/styles/design-system.css", designSystemCss, /Wireline Clear System \/ Wireline Mono/, "name the current monochrome system");
mustInclude("src/styles/tokens.generated.css", webTokens, /--wireline-color-action-primary-default:\s*#111111/, "web tokens must use Wireline Mono");
mustInclude("apps/browser-extension/panel/tokens.generated.css", browserTokens, /--wireline-color-action-primary-default:\s*#111111/, "browser tokens must use Wireline Mono");
mustInclude("src/constants/generated-design-tokens.ts", tokenConstants, /"color\.action\.primary\.default": "#111111"/, "TS tokens must use Wireline Mono");
mustInclude("android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt", androidTokens, /colorActionPrimaryDefault = Color\(0xFF111111\)/, "Android tokens must use Wireline Mono");
mustInclude("ios/Wireline/Theme/WirelineDesignTokens.generated.swift", iosTokens, /colorActionPrimaryDefault = Color\(hex: 0x111111\)/, "iOS tokens must use Wireline Mono");
mustInclude("ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget, /public static let accent = "111111"/, "iOS widget snapshot must use Wireline Mono");
mustInclude("src/lib/chatgpt-mcp.ts", chatgptWidget, /button\.primary \{ background: #111111; color: white; border-color: #111111; \}/, "ChatGPT public widget must use monochrome chrome");
mustInclude("src/lib/chatgpt-mcp-account.ts", chatgptAccountWidget, /button\.primary \{ background: #111111; color: white; border-color: #111111; \}/, "ChatGPT account widget must use monochrome chrome");
mustInclude("public/static-legal.css", legalCss, /--wireline-color-action-primary-default: #111111/, "static legal pages must use Wireline Mono tokens");
mustInclude("public/site.webmanifest", manifest, /"theme_color": "#111111"/, "manifest must use monochrome theme color");
mustInclude("public/site.webmanifest", manifest, /"background_color": "#F7F7F4"/, "manifest must use warm monochrome background");
mustInclude("public/wireline-icon.svg", publicIcon, /fill="#111111"/, "public app icon must be monochrome");
mustInclude("public/favicon.svg", favicon, /fill="#111111"/, "favicon must be monochrome");
mustInclude("apps/browser-extension/assets/icon.svg", extensionIcon, /fill="#111111"/, "browser extension icon must be monochrome");
mustInclude("android/app/src/main/res/drawable/ic_launcher_background.xml", androidLauncherBg, /android:fillColor="#111111"/, "Android launcher background must be monochrome");
for (const [file, source] of [
  ["src/styles/tokens.generated.css", webTokens],
  ["apps/browser-extension/panel/tokens.generated.css", browserTokens],
  ["src/constants/generated-design-tokens.ts", tokenConstants],
  ["android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt", androidTokens],
  ["ios/Wireline/Theme/WirelineDesignTokens.generated.swift", iosTokens],
  ["ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget],
  ["src/components/KnowledgeWorkspace.tsx", knowledgeWorkspace],
  ["src/components/marketing/BrowserCallWidget.tsx", browserCallWidget],
  ["src/lib/chatgpt-mcp.ts", chatgptWidget],
  ["src/lib/chatgpt-mcp-account.ts", chatgptAccountWidget],
  ["public/static-legal.css", legalCss],
  ["public/site.webmanifest", manifest],
  ["public/wireline-icon.svg", publicIcon],
  ["public/favicon.svg", favicon],
  ["apps/browser-extension/assets/icon.svg", extensionIcon],
  ["android/app/src/main/res/drawable/ic_launcher_background.xml", androidLauncherBg],
]) {
  mustExclude(file, source, oldPalette, "old purple/blue palette must not appear in active design surfaces");
}
mustExclude("src/styles/studio-operations.css", studioOperationsCss, /#0a0c12|#0d1017|#12151d|#191e2a|#f7f8fc|#91a8ff/i, "Studio must not define a separate dark theme");
mustExclude("src/components/WorkspaceShell.tsx", workspaceShell, /wl-workspace-shell--studio|studioParams|isStudioOperationsRoute/, "shell must not switch theme by Studio route state");
mustInclude("src/components/WorkspaceShell.tsx", workspaceShell, /label: "Train"/, "primary rail must include Training");
mustInclude("src/components/WorkspaceShell.tsx", workspaceShell, /function isNativeAppShell/, "bottom dock must be gated by native app shell detection");
mustInclude("src/components/WorkspaceShell.tsx", workspaceShell, /nativeAppShell \? <NativeDock/, "bottom dock must only render for native app shells");
mustInclude("src/routes/AppRoutes.tsx", appRoutes, /path="\/training" element=\{<KnowledgePage/, "Training must be first-class route");
mustInclude("src/routes/AppRoutes.tsx", appRoutes, /path="\/knowledge" element=\{<Navigate to="\/training"/, "Knowledge must redirect to Training");
mustInclude("src/components/CreateAgentDialog.tsx", createDialog, /Name, voice, personality, role/, "create flow must remain a short intake");
mustInclude("src/components/CreateAgentDialog.tsx", createDialog, /navigate\(`\/training\?agent=/, "create flow must land in Training");
mustInclude("src/components/StudioWorkspaceV2.tsx", studioWorkspace, /StudioWorkroom/, "Studio must use chat-first workroom");
mustExclude("src/components/StudioWorkspaceV2.tsx", studioWorkspace, /StudioAssistantWorkspace/, "old Studio assistant rail must not be active");
mustExclude("src/components/StudioWorkroom.tsx", studioWorkroom, /PanelRightOpen|Working context|Detailed view/, "Workroom must not have a right context rail");
mustInclude("src/pages/KnowledgePage.tsx", trainingPage, /TrainingRail/, "Training must own heavy controls in a side rail");
mustInclude("src/pages/KnowledgePage.tsx", trainingPage, /AgentAssetUpload/, "Training must own document ingestion");
mustInclude("src/components/AgentAssetUpload.tsx", assetUpload, /\/api\/agent-config\/\$\{encodeURIComponent\(agentId\)\}\/assets/, "document intake must use asset ingestion API");
mustBeDeleted("src/components/StudioAssistantWorkspace.tsx", "dead legacy Studio rail must stay deleted");
mustBeDeleted("src/components/ui/NebulaPulse.tsx", "unused nebula visual primitive must stay deleted");
mustBeDeleted("scripts/check-active-surface-drift.mjs", "retired Ametrine surface contract must stay deleted");

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
