import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const issues = [];
const check = (ok, text) => { if (!ok) issues.push(text); };
for (const path of ["src/main.tsx","src/index.css","src/styles/precision-operator-web.css","src/lib/stitch-design-system.ts","src/routes/AppRoutes.tsx","src/App.tsx","src/components/WorkspaceShell.tsx",".stitch/DESIGN.md"]) check(existsSync(resolve(root, path)), `${path} is required`);

const css = read("src/styles/precision-operator-web.css").toLowerCase();
for (const token of ["#f7f7f5","#f9f9f7","#ffffff","#f4f4f2","#eeeeec","#e8e8e6","#e2e3e1","#1a1c1b","#414846","#717976","#c1c8c4","#e5e5e2","#1a3c34","#01261f","#c5eadf","#aacec3"]) check(css.includes(token), `missing source token ${token}`);
for (const value of ["--radius-sm:.125rem","--radius:.25rem","--radius-md:.375rem","--radius-lg:.5rem","--radius-xl:.75rem"]) check(css.includes(value), `missing source radius ${value}`);
for (const value of ["font-size:11px;font-weight:600;line-height:16px","font-size:32px;font-weight:600;line-height:40px","font-size:16px;line-height:24px","font-size:14px;line-height:20px","font-size:12px;font-weight:500;line-height:16px"]) check(css.includes(value), `missing source type rule ${value}`);
check(!css.includes("font-weight:650"), "source layer must not use synthetic 650 weight");
check(!css.includes("font-smoothing"), "source layer must not force font smoothing");

const index = read("src/index.css");
check(index.includes('"./styles/precision-operator-web.css"'), "exact source layer must be imported");
check(!index.includes("precision-type.css"), "retired type layer must not be imported");
check(!index.includes("font-smoothing"), "global body must not force font smoothing");
const registry = read("src/lib/stitch-design-system.ts");
check(registry.includes("15464421841872665077"), "registry must use Precision Operator");
check(registry.includes('tokens: "src/styles/precision-operator-web.css"'), "registry must use exact source layer");
for (const source of ["studio_agent_training","agents_fleet_roster","knowledge_facts_rules","actions_permissions_connections","live_real_time_ops","settings_workspace_admin"]) check(registry.includes(source), `missing route source ${source}`);
const shell = read("src/components/WorkspaceShell.tsx");
check(shell.includes("212px") && shell.includes("max-w-[1680px]"), "shell must retain fixed-fluid layout");
check(shell.includes("lg:px-10"), "shell must retain 40px desktop margin");
const routes = read("src/routes/AppRoutes.tsx");
check(routes.includes('path="/actions" element={<IntegrationsPage />}'), "Actions must be canonical");
check(routes.includes('path="/integrations" element={<Navigate to="/actions" replace />}'), "integrations redirect is required");
check(read("src/App.tsx").includes('path="/for/personal" element={<VerticalLanding slug="personal" />}'), "personal route is required");
if (issues.length) { console.error("Precision Operator contract failed:\n- " + issues.join("\n- ")); process.exitCode = 1; } else console.log("Precision Operator contract passed");
