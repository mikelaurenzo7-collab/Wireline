#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROUTES_DIR = "src/routes";
const source = readFileSync("src/server/register-api-routes.ts", "utf8");
const body = source.slice(source.indexOf("export function registerApiRoutes"));
const appUseLines = body
  .split("\n")
  .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
  .filter(({ line }) => line.startsWith("app.use("));

const indexOf = (needle) => appUseLines.findIndex(({ line }) => line.includes(needle));
const problems = [];

// Orphan detection: an Express router file under src/routes/ (top level OR a
// subdirectory such as oauth/) that isn't transitively mounted from
// register-api-routes.ts is a silent 404 in production. Historical example:
// escalation-routes.ts was the target of the four flagship voice agents'
// escalate_to_human tool and was never mounted, so every escalation 404'd.
// Reachability follows default imports passed to app.use()/router.use(), so
// sub-router composition (oauth/index.ts providers, twilio-webhook-base,
// video-presenter-routes-base, grok-live-profile-routes) counts as mounted
// only while the import AND the router.use(...) both exist. Files mounted by a
// separate serverless entrypoint are enumerated below, and each claim is
// verified against the mounting file rather than trusted as prose.
const MOUNTED_ELSEWHERE = [
  // Public MCP surface mounted by the standalone ChatGPT entrypoint.
  { file: "chatgpt-mcp-routes.ts", mountedBy: "src/entrypoints/chatgpt-mcp-api.ts" },
  { file: "chatgpt-mcp-account-routes.ts", mountedBy: "src/entrypoints/chatgpt-mcp-api.ts" },
];

function walkTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkTsFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(full);
  }
  return files;
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Per-module facts for every TypeScript file under src/routes/.
const routeFiles = walkTsFiles(ROUTES_DIR)
  .filter((file) => file.endsWith(".ts"))
  .sort();
const moduleInfo = new Map();
for (const file of routeFiles) {
  const content = readFileSync(file, "utf8");
  const defaultImports = new Map();
  const defaultImportRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](\.[^"']+)["']/g;
  for (const match of content.matchAll(defaultImportRe)) {
    const resolved = resolveRelativeImport(file, match[2]);
    if (resolved) defaultImports.set(match[1], resolved);
  }
  // A mount is strictly `x.use(subRouter)` or `x.use("/prefix", subRouter)`;
  // path-middleware chains with extra arguments do not count as mounting.
  const mountedModules = new Set();
  const mountRe =
    /\b(?:app|router)\.use\(\s*(?:["'][^"']*["']\s*,\s*)?([A-Za-z_$][\w$]*)\s*,?\s*\)/g;
  for (const match of content.matchAll(mountRe)) {
    const target = defaultImports.get(match[1]);
    if (target) mountedModules.add(target);
  }
  moduleInfo.set(path.resolve(file), {
    relative: path.relative(ROUTES_DIR, file),
    constructsRouter: content.includes("Router()"),
    mountedModules: [...mountedModules].map((target) => path.resolve(target)),
  });
}

// Roots: modules register-api-routes.ts both imports and app.use()s.
const registryImports = new Map();
const registryImportRe = /import\s+(\w+)\s+from\s+["']\.\.\/routes\/([\w/-]+)["']/g;
for (const match of source.matchAll(registryImportRe)) {
  const resolved = resolveRelativeImport(
    "src/server/register-api-routes.ts",
    `../routes/${match[2]}`,
  );
  if (resolved) registryImports.set(match[1], path.resolve(resolved));
}
const mounted = new Set();
const registryMountRe = /app\.use\(\s*(?:["'][^"']*["']\s*,\s*)?(\w+)\s*\)/g;
for (const match of source.matchAll(registryMountRe)) {
  const target = registryImports.get(match[1]);
  if (target) mounted.add(target);
}
const queue = [...mounted];
while (queue.length) {
  const info = moduleInfo.get(queue.pop());
  if (!info) continue;
  for (const target of info.mountedModules) {
    if (!mounted.has(target)) {
      mounted.add(target);
      queue.push(target);
    }
  }
}

// Verify each MOUNTED_ELSEWHERE claim: the named mounting file must import the
// router AND pass that identifier to app.use()/router.use(). A stale claim
// (deleted import or dropped use) means the route file silently 404s while the
// allowlist keeps this check green — exactly the failure this guards against.
const mountedElsewhereFiles = new Set();
for (const { file, mountedBy } of MOUNTED_ELSEWHERE) {
  mountedElsewhereFiles.add(path.resolve(ROUTES_DIR, file));
  if (!existsSync(path.join(ROUTES_DIR, file))) {
    problems.push(
      `MOUNTED_ELSEWHERE entry ${file} does not exist under src/routes/ (remove the stale entry).`,
    );
    continue;
  }
  if (!existsSync(mountedBy)) {
    problems.push(
      `MOUNTED_ELSEWHERE claims ${file} is mounted by ${mountedBy}, but that file does not exist.`,
    );
    continue;
  }
  const mounterSource = readFileSync(mountedBy, "utf8");
  const moduleName = file.replace(/\.ts$/, "");
  const importMatch = new RegExp(
    `import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["'][^"']*/${moduleName}["']`,
  ).exec(mounterSource);
  if (!importMatch) {
    problems.push(
      `${mountedBy} does not import src/routes/${file} — the MOUNTED_ELSEWHERE claim is stale.`,
    );
    continue;
  }
  const useRe = new RegExp(
    `\\b(?:app|router)\\.use\\(\\s*(?:["'][^"']*["']\\s*,\\s*)?${importMatch[1]}\\s*,?\\s*\\)`,
  );
  if (!useRe.test(mounterSource)) {
    problems.push(
      `${mountedBy} imports src/routes/${file} but never app.use()/router.use()s it (silent 404).`,
    );
  }
}

// Every router-constructing file must be transitively mounted (or verifiably
// mounted elsewhere). Non-router helpers in subdirectories (e.g. vapi/ tool
// handlers) must at least be imported somewhere in src/, or they are dead code
// masquerading as route modules.
const importedAnywhere = new Set();
for (const file of walkTsFiles("src")) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const resolved = resolveRelativeImport(file, match[1]);
    if (resolved) importedAnywhere.add(path.resolve(resolved));
  }
}
for (const [absolute, info] of moduleInfo) {
  if (info.constructsRouter) {
    if (!mounted.has(absolute) && !mountedElsewhereFiles.has(absolute)) {
      problems.push(
        `Route file src/routes/${info.relative} creates an Express router but is never mounted from src/server/register-api-routes.ts, directly or via a mounted router's router.use(...) (silent 404 in production; mount it or extend MOUNTED_ELSEWHERE in this script if intentional).`,
      );
    }
  } else if (info.relative.includes(path.sep) && !importedAnywhere.has(absolute)) {
    problems.push(
      `src/routes/${info.relative} is not imported by any file under src/ (dead module in a routes subdirectory; wire it up or delete it).`,
    );
  }
}

function requireOrder(before, after, reason) {
  const a = indexOf(before);
  const b = indexOf(after);
  if (a === -1) problems.push(`Missing route registration containing ${before}.`);
  if (b === -1) problems.push(`Missing route registration containing ${after}.`);
  if (a !== -1 && b !== -1 && a >= b) {
    problems.push(`${before} must be registered before ${after}: ${reason}`);
  }
}

if (!appUseLines[0]?.line.includes('"/api/health", healthRouter')) {
  problems.push("/api/health must be the first registered API route.");
}

requireOrder(
  "spendControlRouter",
  "auditRouter",
  "legacy /api/spend/budget shadowing depends on this order",
);
requireOrder(
  "metaWebhookRouter",
  '"/api/webhooks", webhookRouter',
  "public Meta webhook receiver must keep precedence over tenant webhook management",
);
requireOrder(
  "authOAuthRouter",
  "authRouter",
  "OAuth provider callback routes must precede the generic auth router",
);
requireOrder(
  "agentRouter",
  "agentWorkspaceRouter",
  "canonical agent CRUD/config routes should precede workspace helpers",
);
requireOrder(
  "dashboardRouter",
  "fleetRouter",
  "overview/calls route plane should precede assistant presence helpers",
);
requireOrder(
  "pipelineRouter",
  "quotaRouter",
  "insights/pipeline routes should stay ahead of quota management",
);

const duplicateMounts = new Map();
for (const { line } of appUseLines) {
  const match = line.match(/^app\.use\(("[^"]+"|'[^']+')/);
  if (!match) continue;
  const mount = match[1].slice(1, -1);
  duplicateMounts.set(mount, (duplicateMounts.get(mount) || 0) + 1);
}
// "/api" is a deliberate shared prefix: several feature routers (billing,
// OpenAPI, and others) define their own sub-paths and mount under it.
// "/api/webhooks" is deliberately mounted twice in register-api-routes.ts:
// the target-specific test-delivery router owns POST /:id/test ahead of the
// broad webhook router, and both routers are authenticated and
// permission-gated, so the ordering is a security-preserving precedence
// decision rather than an accidental duplicate.
const allowedDuplicateMounts = new Set(["/api", "/api/webhooks"]);
for (const [mount, count] of duplicateMounts) {
  if (count > 1 && !allowedDuplicateMounts.has(mount)) {
    problems.push(
      `Duplicate explicit route mount ${mount} appears ${count} times without an allowlist entry.`,
    );
  }
}

if (problems.length) {
  console.error("route registry check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  `route registry ok (${appUseLines.length} app.use registrations, ${moduleInfo.size} route files, ${mounted.size} mounted)`,
);
