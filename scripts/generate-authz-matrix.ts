#!/usr/bin/env tsx
/**
 * generate-authz-matrix.ts
 *
 * Default-deny authorization contract for Wireline's HTTP surface.
 *
 * Scans every route file, resolves each route's FULL path by combining the
 * router's mount base (parsed from server.ts) with the in-file path, then
 * verifies each route is either:
 *   (a) protected by an auth middleware (authenticateUser / requirePermission /
 *       requireRole / requireInternalJwtSecret), OR
 *   (b) on the explicit, documented public allowlist below.
 *
 * Any route that is neither protected nor explicitly allowlisted is a
 * violation and fails the process (exit 1) — so a newly-added unprotected
 * route can never reach production silently.
 *
 * Usage:
 *   npx tsx scripts/generate-authz-matrix.ts        # write matrix + gate
 *   npm run authz:check                              # same, via package.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.resolve(REPO_ROOT, "src/routes");
const SERVER_FILE = path.resolve(REPO_ROOT, "server.ts");
const OUTPUT_FILE = path.resolve(REPO_ROOT, "docs/AUTHZ_MATRIX.md");

const AUTH_MIDDLEWARE = [
  "authenticateUser",
  "authenticateEventStream",
  "requirePermission",
  "requireRole",
  "requireInternalJwtSecret",
];

/**
 * Explicit, documented public allowlist. Each entry is a conscious security
 * decision: the route is reachable without a Wireline JWT *by design*, and the
 * reason states how it is otherwise protected (signature, API key, or "truly
 * public marketing data"). Matched against the RESOLVED full path.
 *
 * Adding an entry here should be a reviewed change — that is the whole point
 * of the default-deny contract.
 */
const PUBLIC_ALLOWLIST: { pattern: RegExp; reason: string }[] = [
  // ── Webhooks: provider-signature authenticated ──────────────────────
  { pattern: /^\/api\/stripe-webhook$/, reason: "Stripe signature verification + idempotency" },
  { pattern: /^\/api\/twilio-webhook\//, reason: "Twilio signature validation + rate limit" },
  { pattern: /^\/api\/webhooks\/meta\//, reason: "Meta HMAC-SHA256 signature + rate limit" },
  { pattern: /^\/api\/webhooks\/elevenlabs/, reason: "ElevenLabs HMAC-SHA256 signature" },
  { pattern: /^\/api\/vapi\//, reason: "Vapi tool/webhook signature verification" },
  { pattern: /^\/api\/escalate$/, reason: "Vapi X-Vapi-Secret (timing-safe) + rate limit" },
  // ── Alternately-authed (secret/token checked in handler) ────────────
  {
    pattern: /^\/api\/admin\/sync-vapi-knowledge$/,
    reason: "Owner email OR X-Migration-Token (timing-safe), enforced in handler",
  },
  {
    pattern:
      /^\/api\/admin\/(operating-cockpit|tenant-economics|launch-readiness|economics-at-risk-count|trust-pack\/soc2)$/,
    reason:
      "Owner email OR X-Migration-Token (timing-safe), enforced in handler via authorizeMigration",
  },
  {
    pattern: /^\/api\/integrations\/certified$/,
    reason: "Public certified-integration status; rate-limited, no tenant data",
  },
  {
    pattern: /^\/api\/daily-brief\/schedule$/,
    reason: "Vercel cron; Bearer CRON_SECRET (timing-safe)",
  },
  { pattern: /^\/api\/intake\/leads?$/, reason: "API-key auth via X-Wireline-Key + rate limit" },
  // ── Auth/OAuth/compliance: public by definition ─────────────────────
  { pattern: /^\/api\/oauth\//, reason: "OAuth initiation/callback (state-validated)" },
  { pattern: /^\/api\/auth\//, reason: "Signup/login/refresh (public by definition)" },
  {
    pattern: /^\/api\/email\/unsubscribe$/,
    reason: "CAN-SPAM one-click unsubscribe; token-scoped + rate-limited",
  },
  // ── Truly public, zero-sensitivity reads ────────────────────────────
  { pattern: /^\/api\/health(\/|$)/, reason: "Liveness/readiness probes; rate-limited, no PII" },
  { pattern: /^\/api\/public\//, reason: "Aggregated, no-PII marketing counters; rate-limited" },
  { pattern: /^\/api\/billing\/plans$/, reason: "Public plan/price comparison table" },
  { pattern: /^\/api\/quotas\/plans$/, reason: "Public plan limits comparison table" },
  { pattern: /^\/api\/agents\/roles$/, reason: "Static role reference enum; no tenant data" },
  { pattern: /^\/api\/openapi\.json$/, reason: "Public OpenAPI spec; rate-limited + CDN cached" },
  { pattern: /^\/api\/support\/ticket$/, reason: "Public support form; rate-limited + validated" },
  { pattern: /^\/api\/contact$/, reason: "Public marketing contact form; rate-limited" },
  {
    pattern: /^\/api\/voices\/:id\/preview$/,
    reason: "Premade voice previews only; cloned/tenant voices are on the authed route",
  },
  {
    pattern: /^\/api\/voice\/metrics$/,
    reason: "Vapi X-Vapi-Secret (timing-safe) verified in handler; telemetry write",
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
  allowReason: string | null;
  line: number;
}

function lineOf(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split("\n").length;
}

function allowlistReason(fullPath: string): string | null {
  const hit = PUBLIC_ALLOWLIST.find((e) => e.pattern.test(fullPath));
  return hit ? hit.reason : null;
}

/**
 * Parse server.ts to map each route file → its mount base path.
 *
 * Steps:
 *   1. import xRouter from "./src/routes/foo"   → { xRouter: "foo" }
 *   2. app.use("/api/foo", xRouter)             → { foo: "/api/foo" }
 *      app.use(xRouter)                         → { foo: "" }
 */
function parseMountTable(): Map<string, string> {
  const server = fs.readFileSync(SERVER_FILE, "utf8");

  // import varName from "./src/routes/<file>"
  const varToFile = new Map<string, string>();
  const importRe = /import\s+(\w+)\s+from\s+["']\.\/src\/routes\/([\w-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(server)) !== null) {
    varToFile.set(m[1], m[2]);
  }

  // app.use("/base", varName)  OR  app.use(varName)
  const fileToBase = new Map<string, string>();
  const useWithBaseRe = /app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  while ((m = useWithBaseRe.exec(server)) !== null) {
    const base = m[1];
    const file = varToFile.get(m[2]);
    if (file) fileToBase.set(file, base);
  }
  const useBareRe = /app\.use\(\s*(\w+)\s*\)/g;
  while ((m = useBareRe.exec(server)) !== null) {
    const file = varToFile.get(m[1]);
    if (file && !fileToBase.has(file)) fileToBase.set(file, "");
  }

  return fileToBase;
}

/** Combine mount base + in-file path into a normalized absolute path. */
function resolveFullPath(base: string, rawPath: string): string {
  // Files that already declare absolute /api/... paths ignore the mount base
  // (the route still resolves correctly because base is typically "" or "/api"
  // for those, and double-prefixing would corrupt the path).
  let full = rawPath.startsWith("/api") ? rawPath : `${base}${rawPath}`;
  full = full.replace(/\/{2,}/g, "/");
  if (full.length > 1 && full.endsWith("/")) full = full.slice(0, -1);
  return full;
}

function scanFile(filePath: string, mountBase: string): RouteEntry[] {
  const content = fs.readFileSync(filePath, "utf8");
  const fileName = path.basename(filePath);
  const entries: RouteEntry[] = [];

  // Router-level auth: router.use(authenticateUser) applied to all routes below.
  const routerAuth = new RegExp(`router\\.use\\(\\s*(?:${AUTH_MIDDLEWARE.join("|")})`).test(
    content,
  );

  // router.METHOD("/path", <middleware chain up to the handler arrow/paren>)
  const routeRe =
    /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)(?:async\s*\(|\(\s*(?:_?req|_)\b|\bfunction\b)/g;

  let match: RegExpExecArray | null;
  while ((match = routeRe.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const rawPath = match[2];
    const middlewareChain = match[3] || "";

    const hasInlineAuth = AUTH_MIDDLEWARE.some((mw) => middlewareChain.includes(mw));
    const hasRequirePermission = middlewareChain.includes("requirePermission");
    const fullPath = resolveFullPath(mountBase, rawPath);

    entries.push({
      file: fileName,
      method,
      rawPath,
      fullPath,
      mountBase,
      hasInlineAuth,
      hasRouterAuth: routerAuth,
      hasRequirePermission,
      allowReason: allowlistReason(fullPath),
      line: lineOf(content, match.index),
    });
  }

  return entries;
}

function main() {
  const mountTable = parseMountTable();

  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith("-routes.ts") || f === "twilio-webhook.ts")
    .map((f) => path.join(ROUTES_DIR, f));

  const all: RouteEntry[] = [];
  for (const file of files) {
    const base = mountTable.get(path.basename(file).replace(/\.ts$/, "")) ?? "";
    all.push(...scanFile(file, base));
  }

  // Dedup by file+method+fullPath (the global regex can occasionally re-enter).
  const unique = new Map<string, RouteEntry>();
  for (const e of all) {
    const key = `${e.file}:${e.method}:${e.fullPath}`;
    if (!unique.has(key)) unique.set(key, e);
  }
  const entries = Array.from(unique.values()).sort(
    (a, b) => a.file.localeCompare(b.file) || a.fullPath.localeCompare(b.fullPath),
  );

  const isProtected = (e: RouteEntry) => e.hasInlineAuth || e.hasRouterAuth;
  const violations = entries.filter((e) => !isProtected(e) && !e.allowReason);

  // ── Markdown report ────────────────────────────────────────────────
  let md = `# Wireline Authorization Matrix (Auto-Generated)\n\n`;
  md += `> Generated by \`scripts/generate-authz-matrix.ts\`. Do not edit by hand.\n\n`;
  md += `**Routes scanned:** ${entries.length}\n  \n`;
  md += `**Protected:** ${entries.filter(isProtected).length}\n  \n`;
  md += `**Public (allowlisted):** ${entries.filter((e) => !isProtected(e) && e.allowReason).length}\n  \n`;
  md += `**Violations:** ${violations.length}\n\n`;

  md += `## Public Allowlist (explicit security decisions)\n\n`;
  md += `| Path | Reason |\n|------|--------|\n`;
  for (const e of entries.filter((x) => !isProtected(x) && x.allowReason)) {
    md += `| \`${e.method} ${e.fullPath}\` | ${e.allowReason} |\n`;
  }
  md += `\n## Full Matrix\n\n`;
  md += `| File | Method | Path | Auth | RBAC | Public | Status |\n`;
  md += `|------|--------|------|------|------|--------|--------|\n`;
  for (const e of entries) {
    const status = isProtected(e)
      ? "Protected"
      : e.allowReason
        ? "Public (allowlisted)"
        : "MISSING AUTH";
    const auth = e.hasInlineAuth ? "inline" : e.hasRouterAuth ? "router" : "—";
    md += `| ${e.file} | ${e.method} | \`${e.fullPath}\` | ${auth} | ${e.hasRequirePermission ? "yes" : "—"} | ${e.allowReason ? "yes" : "—"} | ${status} |\n`;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, md, "utf8");

  console.log(`AuthZ matrix written to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log(
    `  scanned=${entries.length} protected=${entries.filter(isProtected).length} public=${entries.filter((e) => !isProtected(e) && e.allowReason).length} violations=${violations.length}`,
  );

  if (violations.length > 0) {
    console.error(
      `\n❌ Default-deny violation(s) — route(s) with neither auth nor allowlist entry:`,
    );
    for (const v of violations) {
      console.error(`   ${v.file}:${v.line}  ${v.method} ${v.fullPath}`);
    }
    console.error(
      `\nFix: add an auth middleware to the route, or (if intentionally public)\n` +
        `add it to PUBLIC_ALLOWLIST in scripts/generate-authz-matrix.ts with a reason.`,
    );
    process.exit(1);
  }

  console.log("✅ Every route is protected or explicitly allowlisted as public.");
}

main();
