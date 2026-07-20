#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";

const source = readFileSync("src/server/register-api-routes.ts", "utf8");
const body = source.slice(source.indexOf("export function registerApiRoutes"));
const appUseLines = body
  .split("\n")
  .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
  .filter(({ line }) => line.startsWith("app.use("));

const indexOf = (needle) => appUseLines.findIndex(({ line }) => line.includes(needle));
const problems = [];

// Orphan detection: any *-routes.ts file in src/routes/ that isn't imported by
// register-api-routes.ts is a silent 404 in production. Historical example:
// escalation-routes.ts was the target of the four flagship voice agents'
// escalate_to_human tool and was never mounted, so every escalation 404'd.
// Files legitimately mounted elsewhere (a separate serverless entrypoint or a
// helper composed by a sibling router) are enumerated in an explicit allowlist.
const MOUNTED_ELSEWHERE = new Set([
  // Public MCP surface mounted by src/entrypoints/chatgpt-mcp-api.ts.
  "chatgpt-mcp-routes.ts",
  "chatgpt-mcp-account-routes.ts",
  // Transitively mounted by grok-voice-routes via router.use(grokLiveProfileRouter).
  "grok-live-profile-routes.ts",
]);

const routeFiles = readdirSync("src/routes")
  .filter((name) => /-routes\.ts$/.test(name))
  .sort();
for (const file of routeFiles) {
  if (MOUNTED_ELSEWHERE.has(file)) continue;
  const modulePath = `"../routes/${file.replace(/\.ts$/, "")}"`;
  if (!source.includes(modulePath)) {
    problems.push(
      `Route file src/routes/${file} is not imported by src/server/register-api-routes.ts (silent 404 in production; add an app.use(...) or extend MOUNTED_ELSEWHERE in this script if intentional).`,
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

requireOrder("spendControlRouter", "auditRouter", "legacy /api/spend/budget shadowing depends on this order");
requireOrder("metaWebhookRouter", '"/api/webhooks", webhookRouter', "public Meta webhook receiver must keep precedence over tenant webhook management");
requireOrder("authOAuthRouter", "authRouter", "OAuth provider callback routes must precede the generic auth router");
requireOrder("agentRouter", "agentWorkspaceRouter", "canonical agent CRUD/config routes should precede workspace helpers");
requireOrder("dashboardRouter", "fleetRouter", "overview/calls route plane should precede assistant presence helpers");
requireOrder("pipelineRouter", "quotaRouter", "insights/pipeline routes should stay ahead of quota management");

const duplicateMounts = new Map();
for (const { line } of appUseLines) {
  const match = line.match(/^app\.use\(("[^"]+"|'[^']+')/);
  if (!match) continue;
  const mount = match[1].slice(1, -1);
  duplicateMounts.set(mount, (duplicateMounts.get(mount) || 0) + 1);
}
// "/api" is a deliberate shared prefix: several feature routers (billing,
// OpenAPI, and others) define their own sub-paths and mount under it.
const allowedDuplicateMounts = new Set(["/api"]);
for (const [mount, count] of duplicateMounts) {
  if (count > 1 && !allowedDuplicateMounts.has(mount)) {
    problems.push(`Duplicate explicit route mount ${mount} appears ${count} times without an allowlist entry.`);
  }
}

if (problems.length) {
  console.error("route registry check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`route registry ok (${appUseLines.length} app.use registrations checked)`);
