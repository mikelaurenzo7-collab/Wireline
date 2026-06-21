import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => readFileSync(resolve(root, file), "utf8");
const report = (file, message) => failures.push(`${file}: ${message}`);

const required = [
  "src/styles/foundation.css",
  "src/styles/stitch-patterns.css",
  "src/styles/design-system.css",
  "src/lib/stitch-design-system.ts",
  "src/lib/wireline-design-system.ts",
  ".stitch/DESIGN.md",
  ".stitch-export/manifest.json",
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
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) report(file, "required Stitch migration artifact is missing");
}

const foundation = read("src/styles/foundation.css");
if (!/--wl-accent:\s*#1a3c34/i.test(foundation)) {
  report("src/styles/foundation.css", "must define --wl-accent as Stitch forest #1a3c34");
}
if (!/--primary:\s*var\(--wl-accent\)/.test(foundation)) {
  report("src/styles/foundation.css", "must alias --primary to --wl-accent");
}

const indexCss = read("src/index.css");
if (!indexCss.includes("stitch-patterns.css")) {
  report("src/index.css", "must import stitch-patterns.css");
}

const stitchBridge = read("src/lib/stitch-design-system.ts");
if (!stitchBridge.includes("6981221452983374608")) {
  report("src/lib/stitch-design-system.ts", "must reference Stitch project id");
}

const workspaceFiles = [
  "src/components/WorkspaceShell.tsx",
  "src/pages/AgentsPage.tsx",
  "src/pages/LandingPage.tsx",
  "src/components/AuthPortal.tsx",
];

for (const file of workspaceFiles) {
  const source = read(file);
  if (/from-(violet|purple|indigo|fuchsia|pink)-|#7C3AED/i.test(source)) {
    report(file, "contains retired violet/purple design tokens");
  }
  if (/\bbg-\[#1d1d1f\]\b|\btext-\[#1d1d1f\]\b/.test(source)) {
    report(file, "uses hardcoded graphite CTA hex — prefer semantic primary/foreground tokens");
  }
}

if (failures.length) {
  console.error("Stitch design contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Stitch design contract check passed");
}
