import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => readFileSync(resolve(root, file), "utf8");
const exists = (file) => existsSync(resolve(root, file));
const report = (file, message) => failures.push(`${file}: ${message}`);

const required = [
  "src/main.tsx",
  "src/index.css",
  "src/styles/foundation.css",
  "src/styles/stitch-patterns.css",
  "src/styles/design-system.css",
  "src/styles/workspace-buttons.css",
  "src/lib/stitch-design-system.ts",
  "src/lib/wireline-design-system.ts",
  "src/routes/AppRoutes.tsx",
  "src/constants/navigation.ts",
  "src/components/WorkspaceShell.tsx",
  "src/pages/AgentsPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/pages/OperationsPage.tsx",
  "src/components/StudioWorkspaceV2.tsx",
  "src/components/KnowledgeWorkspace.tsx",
  "src/components/IntegrationsWorkspace.tsx",
  "src/pages/LandingPage.tsx",
  "src/pages/Pricing.tsx",
  "src/components/AuthPortal.tsx",
  "public/favicon.svg",
  "public/wireline-icon.svg",
  "public/og-image.svg",
  "public/site.webmanifest",
  ".stitch/DESIGN.md",
  ".stitch-export/manifest.json",
];

for (const file of required) {
  if (!exists(file)) report(file, "required Stitch migration artifact is missing");
}

const exportedScreens = [
  ".stitch-export/wireline-ai-agent-fleet-for-business.html",
  ".stitch-export/sign-in-wireline.html",
  ".stitch-export/agent-studio-integrated-creation.html",
  ".stitch-export/agent-fleet-list-polished.html",
  ".stitch-export/knowledge-base-polished.html",
  ".stitch-export/actions-integrations-polished.html",
  ".stitch-export/live-ops-polished.html",
  ".stitch-export/workspace-settings.html",
  ".stitch-export/sales-solutions-wireline.html",
  ".stitch-export/support-solutions-wireline.html",
  ".stitch-export/pricing-wireline.html",
];

for (const file of exportedScreens) {
  if (!exists(file)) report(file, "canonical Stitch export is missing");
}

const foundation = read("src/styles/foundation.css");
if (!/--wl-accent:\s*#1a3c34/i.test(foundation)) {
  report("src/styles/foundation.css", "must define --wl-accent as Stitch forest #1a3c34");
}
if (!/--primary:\s*var\(--wl-accent\)/.test(foundation)) {
  report("src/styles/foundation.css", "must alias --primary to --wl-accent");
}
if (!/--wl-bg:\s*#f7f7f5/i.test(foundation)) {
  report("src/styles/foundation.css", "must define the Stitch warm surface #f7f7f5");
}

const main = read("src/main.tsx");
const cascade = [
  'import "./styles/foundation.css";',
  'import "./index.css";',
  'import "./styles/monochrome-guard.css";',
  'import "./styles/readability-guard.css";',
];
let previous = -1;
for (const statement of cascade) {
  const position = main.indexOf(statement);
  if (position < 0 || position <= previous) {
    report("src/main.tsx", `must import global CSS in order: ${cascade.join(" → ")}`);
    break;
  }
  previous = position;
}

const indexCss = read("src/index.css");
for (const importPath of [
  "stitch-patterns.css",
  "cta-readability.css",
  "workspace-buttons.css",
]) {
  if (!indexCss.includes(importPath)) {
    report("src/index.css", `must import ${importPath}`);
  }
}

const routes = read("src/routes/AppRoutes.tsx");
if (!routes.includes('path="/actions" element={<IntegrationsPage />}')) {
  report("src/routes/AppRoutes.tsx", "must expose /actions as the canonical Actions route");
}
if (!routes.includes('path="/integrations" element={<Navigate to="/actions" replace />}')) {
  report("src/routes/AppRoutes.tsx", "must redirect legacy /integrations bookmarks to /actions");
}

const shell = read("src/components/WorkspaceShell.tsx");
if (!shell.includes('{ href: "/actions", label: "Actions"')) {
  report("src/components/WorkspaceShell.tsx", "must navigate to canonical /actions");
}
if (shell.includes('{ href: "/integrations", label: "Actions"')) {
  report("src/components/WorkspaceShell.tsx", "must not keep /integrations as an active navigation target");
}

const bridge = read("src/lib/stitch-design-system.ts");
if (!bridge.includes("6981221452983374608")) {
  report("src/lib/stitch-design-system.ts", "must reference the active Stitch project id");
}
for (const file of exportedScreens) {
  if (!bridge.includes(file)) {
    report("src/lib/stitch-design-system.ts", `must map ${file} exactly`);
  }
}

for (const retired of [
  "src/lib/design-preview-route.ts",
  "src/lib/figma-design-system.ts",
  "figma.config.json",
]) {
  if (exists(retired)) report(retired, "retired design bridge must be removed");
}

const strictConfig = read("tsconfig.strict.json");
if (strictConfig.includes("design-preview-route.ts")) {
  report("tsconfig.strict.json", "must not reference the removed design preview helper");
}

const productSources = [
  "src/components/WorkspaceShell.tsx",
  "src/pages/AgentsPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/pages/OperationsPage.tsx",
  "src/pages/LandingPage.tsx",
  "src/components/AuthPortal.tsx",
  "src/components/marketing/RobotHead.tsx",
  "src/contexts/BrandingContext.tsx",
  "public/favicon.svg",
  "public/wireline-icon.svg",
  "public/og-image.svg",
  "public/site.webmanifest",
];

for (const file of productSources) {
  const source = read(file);
  if (/#7c3aed|#a78bfa|#5b21b6|#3d1e7c/i.test(source)) {
    report(file, "contains retired violet brand values");
  }
  if (/(?:text|bg|from|to)-(?:violet|purple|indigo)-/i.test(source)) {
    report(file, "contains retired purple utility classes");
  }
}

if (failures.length) {
  console.error("Stitch design contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Stitch design contract check passed");
}
