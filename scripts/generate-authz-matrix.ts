#!/usr/bin/env tsx
/**
 * generate-authz-matrix.ts
 *
 * Scans every route file and produces a default-deny authorization matrix.
 * Fails CI if any non-public route lacks authenticateUser / requirePermission.
 *
 * Usage:
 *   npx tsx scripts/generate-authz-matrix.ts
 *   npm run verify  (includes this via docs:check or a dedicated step)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.resolve(__dirname, "../src/routes");
const OUTPUT_FILE = path.resolve(__dirname, "../docs/AUTHZ_MATRIX.md");

interface RouteEntry {
  file: string;
  method: string;
  path: string;
  hasAuth: boolean;
  hasRequirePermission: boolean;
  isPublicExempt: boolean;
  line: number;
}

const PUBLIC_EXEMPT_PATTERNS = [
  /^\/api\/health/,
  /^\/api\/public\//,
  /^\/api\/email-unsubscribe/,
  /^\/api\/stripe-webhook/,
  /^\/api\/twilio-webhook/,
  /^\/api\/meta-webhook/,
  /^\/api\/vapi\/webhook/,
  /^\/api\/escalation/,
  /^\/api\/webhooks\/elevenlabs/,
  /^\/api\/oauth\//,
  /^\/api\/auth\//,
];

const AUTH_MIDDLEWARE = ["authenticateUser", "requirePermission", "requireInternalJwtSecret"];

function isPublicExempt(routePath: string): boolean {
  return PUBLIC_EXEMPT_PATTERNS.some((re) => re.test(routePath));
}

function scanFile(filePath: string): RouteEntry[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const entries: RouteEntry[] = [];
  const fileName = path.basename(filePath);

  // Match router.METHOD("/path", middleware..., handler)
  const routeRegex =
    /router\.(get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]\s*,?\s*([^)]*)\)/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const middlewareChain = match[3] || "";

    const hasAuth = AUTH_MIDDLEWARE.some((m) => middlewareChain.includes(m));
    const hasRequirePermission = middlewareChain.includes("requirePermission");
    const isExempt = isPublicExempt(routePath);

    // Find approximate line number
    const lineNumber =
      lines.findIndex((l, idx) => idx >= match!.index && l.includes(routePath)) + 1 || 0;

    entries.push({
      file: fileName,
      method,
      path: routePath,
      hasAuth,
      hasRequirePermission,
      isPublicExempt: isExempt,
      line: lineNumber,
    });
  }

  return entries;
}

function main() {
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith("-routes.ts") || f.endsWith("-webhook.ts") || f === "twilio-webhook.ts")
    .map((f) => path.join(ROUTES_DIR, f));

  const allEntries: RouteEntry[] = [];
  for (const file of files) {
    allEntries.push(...scanFile(file));
  }

  // Deduplicate by file+method+path
  const unique = new Map<string, RouteEntry>();
  for (const e of allEntries) {
    const key = `${e.file}:${e.method}:${e.path}`;
    if (!unique.has(key)) unique.set(key, e);
  }
  const entries = Array.from(unique.values()).sort((a, b) =>
    a.file.localeCompare(b.file) || a.path.localeCompare(b.path),
  );

  const violations = entries.filter(
    (e) => !e.hasAuth && !e.isPublicExempt && !e.hasRequirePermission,
  );

  // Generate markdown
  let md = `# Wireline Authorization Matrix (Auto-Generated)\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Total routes scanned:** ${entries.length}\n`;
  md += `**Violations (missing auth):** ${violations.length}\n\n`;

  md += `## Summary by Risk Tier\n\n`;
  md += `| Tier | Description | Count |\n`;
  md += `|------|-------------|-------|\n`;
  md += `| Critical | Money, data, or destructive ops | ${entries.filter((e) => e.path.includes("billing") || e.path.includes("admin") || e.path.includes("purge")).length} |\n`;
  md += `| High | Tenant data & integrations | ${entries.filter((e) => e.path.includes("webhook") || e.path.includes("agent")).length} |\n`;
  md += `| Standard | Dashboard & settings | ${entries.length - violations.length} |\n`;
  md += `| Public (exempt) | No auth required by design | ${entries.filter((e) => e.isPublicExempt).length} |\n\n`;

  md += `## Full Matrix\n\n`;
  md += `| File | Method | Path | Auth? | RBAC? | Public Exempt? | Status |\n`;
  md += `|------|--------|------|-------|-------|----------------|--------|\n`;

  for (const e of entries) {
    const status = e.isPublicExempt
      ? "✅ Public"
      : e.hasAuth || e.hasRequirePermission
        ? "✅ Protected"
        : "❌ MISSING AUTH";
    md += `| ${e.file} | ${e.method} | \`${e.path}\` | ${e.hasAuth ? "✅" : "—"} | ${e.hasRequirePermission ? "✅" : "—"} | ${e.isPublicExempt ? "✅" : "—"} | ${status} |\n`;
  }

  fs.writeFileSync(OUTPUT_FILE, md, "utf8");
  console.log(`AuthZ matrix written to ${OUTPUT_FILE}`);
  console.log(`Violations found: ${violations.length}`);

  if (violations.length > 0) {
    console.error("\n❌ Default-deny violation(s) detected:");
    for (const v of violations.slice(0, 10)) {
      console.error(`   ${v.file}:${v.line}  ${v.method} ${v.path}`);
    }
    if (violations.length > 10) console.error(`   ... and ${violations.length - 10} more`);
    process.exit(1);
  }

  console.log("✅ All routes either protected or explicitly public-exempt.");
}

main();
