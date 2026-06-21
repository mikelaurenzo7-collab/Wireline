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
  "src/App.tsx",
  "src/components/WorkspaceShell.tsx",
  "src/components/marketing/PublicSiteHeader.tsx",
  "src/components/marketing/MarketingFooter.tsx",
  "src/pages/LandingPage.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/Showcase.tsx",
  "src/pages/Compare.tsx",
  "src/pages/About.tsx",
  "src/pages/VerticalLanding.tsx",
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
for (const [pattern, description] of [
  [/--wl-accent:\s*#1a3c34/i, "must define the Stitch forest accent"],
  [/--wl-bg:\s*#f7f7f5/i, "must define the Stitch warm surface"],
  [/--radius:\s*0\.25rem/i, "must retain the four-pixel default geometry"],
  [/--primary:\s*var\(--wl-accent\)/, "must alias primary to the Stitch accent"],
]) {
  if (!pattern.test(foundation)) report("src/styles/foundation.css", description);
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

const workspaceRoutes = read("src/routes/AppRoutes.tsx");
if (!workspaceRoutes.includes('path="/actions" element={<IntegrationsPage />}')) {
  report("src/routes/AppRoutes.tsx", "must expose /actions as the canonical Actions route");
}
if (!workspaceRoutes.includes('path="/integrations" element={<Navigate to="/actions" replace />}')) {
  report("src/routes/AppRoutes.tsx", "must redirect legacy integration bookmarks to /actions");
}

const publicRoutes = read("src/App.tsx");
if (!publicRoutes.includes('path="/for/personal" element={<VerticalLanding slug="personal" />}')) {
  report("src/App.tsx", "must expose the first-class consumer /for/personal route");
}

const header = read("src/components/marketing/PublicSiteHeader.tsx");
const footer = read("src/components/marketing/MarketingFooter.tsx");
if (!header.includes('to: "/for/personal"')) report("src/components/marketing/PublicSiteHeader.tsx", "must expose personal navigation");
if (!footer.includes('to: "/for/personal"')) report("src/components/marketing/MarketingFooter.tsx", "must expose personal navigation");

const bridge = read("src/lib/stitch-design-system.ts");
if (!bridge.includes("6981221452983374608")) report("src/lib/stitch-design-system.ts", "must reference the active Stitch project id");
for (const file of exportedScreens) {
  if (!bridge.includes(file)) report("src/lib/stitch-design-system.ts", `must map ${file} exactly`);
}

for (const page of [
  "src/pages/Features.tsx",
  "src/pages/Compare.tsx",
  "src/pages/Showcase.tsx",
  "src/pages/About.tsx",
  "src/pages/VerticalLanding.tsx",
]) {
  const source = read(page);
  if (!source.includes("wl-stitch")) report(page, "must use Stitch component primitives");
  if (/font-display|bg-gradient-to-r|#1d1d1f|#f2f2ef/i.test(source)) {
    report(page, "contains pre-Stitch marketing styling");
  }
}

const strictConfig = read("tsconfig.strict.json");
if (!strictConfig.includes("stitch-design-contract.test.ts")) {
  report("tsconfig.strict.json", "must validate the live Stitch contract");
}

const productSources = [
  "src/components/WorkspaceShell.tsx",
  "src/pages/LandingPage.tsx",
  "src/pages/Pricing.tsx",
  "src/components/AuthPortal.tsx",
  "public/favicon.svg",
  "public/wireline-icon.svg",
  "public/og-image.svg",
  "public/site.webmanifest",
];
for (const file of productSources) {
  const source = read(file);
  if (/#7c3aed|#a78bfa|#5b21b6|#3d1e7c/i.test(source)) report(file, "contains retired violet brand values");
  if (/(?:text|bg|from|to)-(?:violet|purple|indigo)-/i.test(source)) report(file, "contains retired purple utility classes");
}

if (failures.length) {
  console.error("Stitch design contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Stitch design contract check passed");
}
