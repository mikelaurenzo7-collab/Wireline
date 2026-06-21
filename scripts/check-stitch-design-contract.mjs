import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const issues = [];
const check = (ok, text) => { if (!ok) issues.push(text); };

for (const path of [
  "src/main.tsx",
  "src/index.css",
  "src/styles/foundation.css",
  "src/styles/stitch-patterns.css",
  "src/styles/design-system.css",
  "src/styles/workspace-buttons.css",
  "src/styles/phone-agent-blueprint.css",
  "src/lib/stitch-design-system.ts",
  "src/lib/stitch-design-contract.test.ts",
  "src/routes/AppRoutes.tsx",
  "src/App.tsx",
  "src/components/WorkspaceShell.tsx",
  ".stitch/DESIGN.md",
  ".stitch/precision-operator/design-md-source.md",
]) check(existsSync(resolve(root, path)), `${path} is required`);

const foundation = read("src/styles/foundation.css").toLowerCase();
for (const token of [
  "--wl-page:#f7f7f5", "--wl-surface-base:#f9f9f7", "--wl-surface:#fff", "--wl-surface-subtle:#f4f4f2",
  "--wl-surface-container:#eeeeec", "--wl-surface-hover:#e8e8e6", "--wl-surface-variant:#e2e3e1",
  "--wl-ink:#1d1d1f", "--wl-muted:#6e6e73", "--wl-ink-soft:#414846", "--wl-line:#e5e5e2",
  "--wl-line-strong:#c1c8c4", "--wl-accent:#1a3c34", "--wl-accent-deep:#01261f",
  "--wl-accent-container:#c5eadf", "--wl-accent-fixed-dim:#aacec3", "--radius:.25rem", "--radius-lg:.5rem", "--radius-xl:.75rem",
]) check(foundation.includes(token), `missing Design MD token ${token}`);
for (const forbidden of ["font-weight:650", "font-smoothing", "backdrop-filter"]) check(!foundation.includes(forbidden), `foundation must not contain ${forbidden}`);

const activeStyles = ["src/styles/foundation.css", "src/styles/stitch-patterns.css", "src/styles/design-system.css", "src/styles/workspace-buttons.css", "src/styles/cta-readability.css", "src/styles/phone-agent-blueprint.css", "src/index.css"].map(read).join("\n").toLowerCase();
for (const forbidden of ["font-weight:650", "font-smoothing", "backdrop-filter", "precision-operator-web.css", "precision-type.css"]) check(!activeStyles.includes(forbidden), `active cascade must not contain ${forbidden}`);

const main = read("src/main.tsx");
check(main.indexOf('import "./styles/foundation.css";') >= 0, "foundation import is required");
check(main.indexOf('import "./index.css";') > main.indexOf('import "./styles/foundation.css";'), "foundation must load before product styles");
for (const retired of ["monochrome-guard.css", "readability-guard.css", "stitch-geometry.css"]) check(!main.includes(retired), `${retired} must not be imported`);

const registry = read("src/lib/stitch-design-system.ts");
check(registry.includes("15464421841872665077"), "registry must use Precision Operator");
check(registry.includes('tokens: "src/styles/foundation.css"'), "registry must use canonical foundation tokens");
for (const source of ["studio_agent_training", "agents_fleet_roster", "knowledge_facts_rules", "actions_permissions_connections", "live_real_time_ops", "settings_workspace_admin"]) check(registry.includes(source), `missing route source ${source}`);

const shell = read("src/components/WorkspaceShell.tsx");
check(shell.includes("212px") && shell.includes("max-w-[1680px]"), "shell must retain fixed-fluid layout");
check(shell.includes("min-h-16"), "shell must retain a 64px top bar");
check(shell.includes("lg:px-10"), "shell must retain 40px desktop page margin");
check(shell.includes("drawerOpen"), "mobile navigation must be a drawer");

const routes = read("src/routes/AppRoutes.tsx");
check(routes.includes('path="/actions" element={<IntegrationsPage />}'), "Actions must be canonical");
check(routes.includes('path="/integrations" element={<Navigate to="/actions" replace />}'), "integrations redirect is required");
check(read("src/App.tsx").includes('path="/for/personal" element={<VerticalLanding slug="personal" />}'), "personal route is required");

if (issues.length) {
  console.error("Precision Operator contract failed:\n- " + issues.join("\n- "));
  process.exitCode = 1;
} else console.log("Precision Operator Design MD contract passed");
