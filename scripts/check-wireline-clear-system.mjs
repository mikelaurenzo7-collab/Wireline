import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const path = resolve(root, relativePath);
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

const packageJson = read("package.json");
const appRoutes = read("src/routes/AppRoutes.tsx");
const foundationCss = read("src/styles/foundation.css");
const designSystemCss = read("src/styles/design-system.css");
const studioOperationsCss = read("src/styles/studio-operations.css");
const workspaceShell = read("src/components/WorkspaceShell.tsx");
const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
const createDialog = read("src/components/CreateAgentDialog.tsx");
const studioWorkroom = read("src/components/StudioWorkroom.tsx");
const trainingPage = read("src/pages/KnowledgePage.tsx");

mustInclude("package.json", packageJson, /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs"/, "design:check must run this file");
mustInclude("src/styles/foundation.css", foundationCss, /color-scheme:\s*light/, "use one light scheme until a complete theme setting exists");
mustInclude("src/styles/foundation.css", foundationCss, /overflow:\s*hidden/, "outer viewport must stay locked");
mustInclude("src/styles/design-system.css", designSystemCss, /Wireline Clear System \/ Wireline Mono/, "name the current monochrome system");
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

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
