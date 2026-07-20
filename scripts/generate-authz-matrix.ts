#!/usr/bin/env tsx
/**
 * Default-deny authorization contract for Wireline's primary HTTP surface.
 *
 * The script reads the canonical route registry, resolves each mounted router's
 * full paths, and rejects any mounted route that is neither protected nor on a
 * deliberate public allowlist. Standalone serverless transports (for example
 * the ChatGPT MCP entrypoint) own dedicated protocol contract tests instead.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.resolve(REPO_ROOT, "src/routes");
const ROUTE_REGISTRY_FILE = path.resolve(REPO_ROOT, "src/server/register-api-routes.ts");
const OUTPUT_FILE = path.resolve(REPO_ROOT, "docs/AUTHZ_MATRIX.md");

const AUTH_MIDDLEWARE = [
  "authenticateUser",
  "authenticateEventStream",
  "requirePermission",
  "requireRole",
  "requirePlatformAdmin",
  "requireMonitorToken",
  "requireInternalJwtSecret",
];

const PUBLIC_ALLOWLIST: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^\/(?:api\/)?stripe-webhook$/,
    reason: "Stripe signature verification + idempotency",
  },
  { pattern: /^\/api\/twilio-webhook\//, reason: "Twilio signature validation + rate limit" },
  { pattern: /^\/api\/webhooks\/meta\//, reason: "Meta HMAC-SHA256 signature + rate limit" },
  { pattern: /^\/api\/vapi\//, reason: "Vapi tool/webhook signature verification" },
  { pattern: /^\/api\/vapi-webhook$/, reason: "Vapi signature validation + agent-scoped routing" },
  { pattern: /^\/api\/escalate$/, reason: "Vapi X-Vapi-Secret (timing-safe) + rate limit" },
  {
    pattern: /^\/api\/integrations\/certified$/,
    reason: "Public certified-integration status; rate-limited, no tenant data",
  },
  {
    pattern: /^\/api\/daily-brief\/schedule$/,
    reason: "Vercel cron; Bearer CRON_SECRET (timing-safe)",
  },
  {
    pattern: /^\/(?:api\/intake\/)?leads?$/,
    reason: "API-key auth via X-Wireline-Key + rate limit",
  },
  { pattern: /^\/api\/oauth\//, reason: "OAuth initiation/callback (state-validated)" },
  { pattern: /^\/api\/auth\//, reason: "Signup/login/refresh (public by definition)" },
  {
    pattern: /^\/api\/email\/unsubscribe$/,
    reason: "CAN-SPAM one-click unsubscribe; token-scoped + rate-limited",
  },
  {
    pattern: /^\/api\/health\/?$/,
    reason: "Public liveness probe; DB ping only, rate-limited",
  },
  {
    pattern: /^\/api\/health\/public$/,
    reason: "Public component status; rate-limited, no tenant data",
  },
  {
    pattern: /^\/api\/health\/report$/,
    reason:
      "Browser client-error reports (pre-auth by design); rate-limited, size-bounded input, no data returned",
  },
  {
    pattern: /^\/api\/health\/slos$/,
    reason: "Monitor token OR authenticated platform admin; enforced in handler",
  },
  {
    pattern: /^\/(?:api\/)?health\/voice-status$/,
    reason: "Public demo-line voice probe; aggregated metrics only, rate-limited",
  },
  { pattern: /^\/api\/public\//, reason: "Aggregated, no-PII marketing counters; rate-limited" },
  {
    pattern: /^\/api\/support\/ticket$/,
    reason: "Public support/contact form; strict validation + 5/15min IP rate limit",
  },
  { pattern: /^\/(?:api\/)?billing\/plans$/, reason: "Public plan/price comparison table" },
  { pattern: /^\/(?:api\/quotas\/)?plans$/, reason: "Public plan limits comparison table" },
  {
    pattern: /^\/(?:api\/)?openapi\.json$/,
    reason: "Public OpenAPI spec; rate-limited + CDN cached",
  },
  { pattern: /^\/api\/support\/ticket$/, reason: "Public support form; rate-limited + validated" },
  { pattern: /^\/api\/contact$/, reason: "Public marketing contact form; rate-limited" },
  {
    pattern: /^\/(?:api\/)?voice\/metrics$/,
    reason: "Vapi X-Vapi-Secret (timing-safe) verified in handler; telemetry write",
  },
  {
    pattern: /^\/recap\/:slug$/,
    reason:
      "Signed shareable call/weekly recap; opaque slug + bearer token verified against stored SHA-256 hash, timing-safe; per-IP + per-slug rate limits",
  },
];

interface RouteEntry {
  file: string;
  method: string;
  rawPath: string;
  fullPath: string;
  mountBase: string;
  hasInlineAuth: boolean;
  hasRouterAuth: boolean;
  hasRequirePermission: boolean;
  hasRequirePlatformAdmin: boolean;
  allowReason: string | null;
  line: number;
}

function lineOf(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split("\n").length;
}

function allowlistReason(fullPath: string): string | null {
  return PUBLIC_ALLOWLIST.find((entry) => entry.pattern.test(fullPath))?.reason || null;
}

/** Resolve the import alias and mount base for each router actually mounted in production. */
function parseMountTable(): Map<string, string> {
  const registry = fs.readFileSync(ROUTE_REGISTRY_FILE, "utf8");
  const variableToFile = new Map<string, string>();
  const importRe = /import\s+(\w+)\s+from\s+["']\.\.\/routes\/([\w/-]+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRe.exec(registry)) !== null) {
    variableToFile.set(match[1], match[2]);
  }

  const fileToBase = new Map<string, string>();
  const useWithBaseRe = /app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  while ((match = useWithBaseRe.exec(registry)) !== null) {
    const file = variableToFile.get(match[2]);
    if (file) fileToBase.set(file, match[1]);
  }

  const useBareRe = /app\.use\(\s*(\w+)\s*\)/g;
  while ((match = useBareRe.exec(registry)) !== null) {
    const file = variableToFile.get(match[1]);
    if (file && !fileToBase.has(file)) fileToBase.set(file, "");
  }

  return fileToBase;
}

function resolveFullPath(base: string, rawPath: string): string {
  let full = rawPath.startsWith("/api") ? rawPath : `${base}${rawPath}`;
  full = full.replace(/\/{2,}/g, "/");
  if (full.length > 1 && full.endsWith("/")) full = full.slice(0, -1);
  return full;
}

function scanFile(filePath: string, mountBase: string): RouteEntry[] {
  const content = fs.readFileSync(filePath, "utf8");
  const file = path.basename(filePath);
  const routerAuth = new RegExp(`router\\.use\\(\\s*(?:${AUTH_MIDDLEWARE.join("|")})`).test(
    content,
  );
  const routeRe =
    /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)(?:async\s*\(|\(\s*(?:_?req|_)\b|\bfunction\b)/g;
  const entries: RouteEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = routeRe.exec(content)) !== null) {
    const middlewareChain = match[3] || "";
    const fullPath = resolveFullPath(mountBase, match[2]);
    entries.push({
      file,
      method: match[1].toUpperCase(),
      rawPath: match[2],
      fullPath,
      mountBase,
      hasInlineAuth: AUTH_MIDDLEWARE.some((middleware) => middlewareChain.includes(middleware)),
      hasRouterAuth: routerAuth,
      hasRequirePermission: middlewareChain.includes("requirePermission"),
      hasRequirePlatformAdmin: middlewareChain.includes("requirePlatformAdmin"),
      allowReason: allowlistReason(fullPath),
      line: lineOf(content, match.index),
    });
  }

  return entries;
}

function resolveRouteFile(file: string): string {
  const direct = path.join(ROUTES_DIR, `${file}.ts`);
  if (fs.existsSync(direct)) return direct;
  return path.join(ROUTES_DIR, file, "index.ts");
}

function formatRbac(entry: RouteEntry): string {
  const tags: string[] = [];
  if (entry.hasRequirePlatformAdmin) tags.push("platform_admin");
  if (entry.hasRequirePermission) tags.push("permission");
  return tags.length ? tags.join("+") : "—";
}

function normalizeMarkdownForComparison(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n");
}

function main() {
  const mountTable = parseMountTable();
  const entries = [...mountTable.entries()]
    .flatMap(([file, mountBase]) => scanFile(resolveRouteFile(file), mountBase))
    .filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            `${candidate.file}:${candidate.method}:${candidate.fullPath}` ===
            `${entry.file}:${entry.method}:${entry.fullPath}`,
        ) === index,
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.fullPath.localeCompare(b.fullPath));

  const isProtected = (entry: RouteEntry) => entry.hasInlineAuth || entry.hasRouterAuth;
  const violations = entries.filter((entry) => !isProtected(entry) && !entry.allowReason);

  let markdown = "# Wireline Authorization Matrix (Auto-Generated)\n\n";
  markdown += "> Generated by `scripts/generate-authz-matrix.ts`. Do not edit by hand.\n\n";
  markdown +=
    "**Source:** canonical production route registry (`src/server/register-api-routes.ts`)\n\n";
  markdown += `**Routes scanned:** ${entries.length}\n`;
  markdown += `**Protected:** ${entries.filter(isProtected).length}\n`;
  markdown += `**Public (allowlisted):** ${entries.filter((entry) => !isProtected(entry) && entry.allowReason).length}\n`;
  markdown += `**Violations:** ${violations.length}\n\n`;
  markdown +=
    "## Public Allowlist (explicit security decisions)\n\n| Path | Reason |\n|------|--------|\n";
  for (const entry of entries.filter((item) => !isProtected(item) && item.allowReason)) {
    markdown += `| \`${entry.method} ${entry.fullPath}\` | ${entry.allowReason} |\n`;
  }
  markdown +=
    "\n## Full Matrix\n\n| File | Method | Path | Auth | RBAC | Public | Status |\n|------|--------|------|------|------|--------|--------|\n";
  for (const entry of entries) {
    const status = isProtected(entry)
      ? "Protected"
      : entry.allowReason
        ? "Public (allowlisted)"
        : "MISSING AUTH";
    const auth = entry.hasInlineAuth ? "inline" : entry.hasRouterAuth ? "router" : "—";
    markdown += `| ${entry.file} | ${entry.method} | \`${entry.fullPath}\` | ${auth} | ${formatRbac(entry)} | ${entry.allowReason ? "yes" : "—"} | ${status} |\n`;
  }

  const previousMarkdown = fs.existsSync(OUTPUT_FILE)
    ? normalizeMarkdownForComparison(fs.readFileSync(OUTPUT_FILE, "utf8"))
    : null;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, markdown, "utf8");
  console.log(`AuthZ matrix written to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log(
    `  scanned=${entries.length} protected=${entries.filter(isProtected).length} public=${entries.filter((entry) => !isProtected(entry) && entry.allowReason).length} violations=${violations.length}`,
  );

  if (violations.length) {
    console.error(
      "\nDefault-deny violation(s) — mounted route(s) with neither auth nor allowlist entry:",
    );
    for (const violation of violations) {
      console.error(
        `   ${violation.file}:${violation.line}  ${violation.method} ${violation.fullPath}`,
      );
    }
    process.exit(1);
  }

  if (previousMarkdown !== null && previousMarkdown !== markdown) {
    console.error(
      "\nAUTHZ_MATRIX.md is stale — regenerated docs/AUTHZ_MATRIX.md. Commit the updated matrix.",
    );
    process.exit(1);
  }

  console.log("Every mounted primary-API route is protected or explicitly allowlisted as public.");
}

main();
