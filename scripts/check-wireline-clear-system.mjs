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
const foundationCss = read("src/styles/foundation.css");
const designSystemCss = read("src/styles/design-system.css");
const studioOperationsCss = read("src/styles/studio-operations.css");
const workspaceShell = read("src/components/WorkspaceShell.tsx");

mustInclude("package.json", packageJson, /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs"/, "design:check must run this file");
mustInclude("src/styles/foundation.css", foundationCss, /color-scheme:\s*light/, "use one light scheme until a complete theme setting exists");
mustInclude("src/styles/design-system.css", designSystemCss, /Wireline Clear System/, "name the current design system");
mustExclude("src/styles/studio-operations.css", studioOperationsCss, /#0a0c12|#0d1017|#12151d|#191e2a|#f7f8fc|#91a8ff/i, "Studio must not define a separate dark theme");
mustExclude("src/components/WorkspaceShell.tsx", workspaceShell, /wl-workspace-shell--studio|studioParams|isStudioOperationsRoute/, "shell must not switch theme by Studio route state");

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
