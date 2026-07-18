import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Provider-neutral Studio check failed: ${message}`);
  process.exitCode = 1;
};

const canonicalPath = "src/pages/AgentStudioHome.tsx";
const legacyPath = "src/pages/AgentStudioHomeClaude.tsx";
const routes = read("src/routes/AppRoutes.tsx");
const manifest = read("src/lib/studio-canvas-contract.ts");
const executableManifest = read("scripts/lib/studio-canvas-contract.mjs");

if (!existsSync(resolve(root, canonicalPath))) fail(`${canonicalPath} is missing`);
if (existsSync(resolve(root, legacyPath))) fail(`${legacyPath} must be removed`);
if (!routes.includes('import("../pages/AgentStudioHome")'))
  fail("authenticated Studio route is not using AgentStudioHome");
if (routes.includes("AgentStudioHomeClaude"))
  fail("authenticated Studio route still references the former provider-named module");

for (const [path, source] of [
  ["src/lib/studio-canvas-contract.ts", manifest],
  ["scripts/lib/studio-canvas-contract.mjs", executableManifest],
]) {
  if (!source.includes('studioHome: "src/pages/AgentStudioHome.tsx"'))
    fail(`${path} does not point to the canonical Studio entry`);
  if (!source.includes("provider-neutral-studio-route"))
    fail(`${path} does not require the neutral Studio route`);
  if (!source.includes("provider-bound-studio-route"))
    fail(`${path} does not forbid the former provider-bound route`);
}

if (!process.exitCode) console.log("Provider-neutral Studio check passed.");
