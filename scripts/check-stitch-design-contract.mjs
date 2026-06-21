import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const issues = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const has = (path) => existsSync(resolve(root, path));
const check = (condition, message) => { if (!condition) issues.push(message); };

for (const path of [
  "src/main.tsx",
  "src/index.css",
  "src/styles/foundation.css",
  "src/styles/stitch-patterns.css",
  "src/lib/stitch-design-system.ts",
  "src/lib/stitch-design-contract.test.ts",
  "src/routes/AppRoutes.tsx",
  "src/App.tsx",
  "src/components/WorkspaceShell.tsx",
  "src/components/AuthPortal.tsx",
  "src/pages/LandingPage.tsx",
  "src/pages/Pricing.tsx",
  ".stitch/DESIGN.md",
  ".stitch/precision-operator/manifest.json",
]) check(has(path), `${path} is required`);

const foundation = read("src/styles/foundation.css");
for (const [value, label] of [
  ["--wl-bg: #f7f7f5", "warm page surface"],
  ["--wl-surface: #ffffff", "white surface"],
  ["--wl-ink: #1d1d1f", "primary ink"],
  ["--wl-muted: #6e6e73", "secondary ink"],
  ["--wl-accent: #1a3c34", "forest accent"],
  ["--wl-accent-deep: #01261f", "deep forest primary"],
  ["--radius: 0.25rem", "4px controls"],
  ["--radius-lg: 0.5rem", "8px cards"],
]) check(foundation.toLowerCase().includes(value), `foundation is missing ${label}`);
check(foundation.includes("-webkit-font-smoothing: auto"), "foundation must preserve native type rendering");
check(!foundation.includes("font-weight: 650"), "foundation must not use synthetic 650 weight");

const main = read("src/main.tsx");
check(main.indexOf('import "./styles/foundation.css";') >= 0, "foundation import is required");
check(main.indexOf('import "./index.css";') > main.indexOf('import "./styles/foundation.css";'), "product styles must follow foundation");
for (const path of ["monochrome-guard.css", "readability-guard.css", "stitch-geometry.css"]) check(!main.includes(path), `${path} must not be in the active cascade`);

const registry = read("src/lib/stitch-design-system.ts");
check(registry.includes("15464421841872665077"), "registry must use Precision Operator");
for (const name of ["studio_agent_training", "agents_fleet_roster", "knowledge_facts_rules", "actions_permissions_connections", "live_real_time_ops", "settings_workspace_admin"]) check(registry.includes(name), `registry is missing ${name}`);

const workspace = read("src/routes/AppRoutes.tsx");
check(workspace.includes('path="/actions" element={<IntegrationsPage />}'), "Actions must remain canonical");
check(workspace.includes('path="/integrations" element={<Navigate to="/actions" replace />}'), "integration redirect is required");
const app = read("src/App.tsx");
check(app.includes('path="/for/personal" element={<VerticalLanding slug="personal" />}'), "personal route is required");

if (issues.length) {
  console.error("Precision Operator contract failed:\n- " + issues.join("\n- "));
  process.exitCode = 1;
} else console.log("Precision Operator contract passed");
