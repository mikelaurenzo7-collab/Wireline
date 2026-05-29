#!/usr/bin/env tsx
/**
 * AuthZ Matrix Generator
 *
 * Parses all route files and generates a comprehensive authorization matrix.
 * Fails CI if any route lacks explicit authentication or a documented public exemption.
 *
 * Owner-grade security: No route should be unprotected by accident.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface RouteInfo {
  file: string;
  routePrefix: string;
  methods: string[];
  hasAuthenticateUser: boolean;
  hasRequirePermission: boolean;
  hasRequireRole: boolean;
  isPubliclyDocumented: boolean;
  publicReason?: string;
}

const ROUTES_DIR = path.join(__dirname, "..", "src", "routes");
const PUBLICLY_DOCUMENTED_PATHS = new Set([
  "/api/webhooks/meta/leads",
  "/api/webhooks/elevenlabs",
  "/api/twilio-webhook",
  "/api/escalate",
  "/api/stripe-webhook",
  "/api/health",
]);

const PUBLIC_REASONS: Record<string, string> = {
  "meta-webhook-routes": "Meta Lead Ads webhook — signature verified",
  "webhooks-elevenlabs-routes": "ElevenLabs voice cloning webhook — signature verified",
  "twilio-webhook": "Twilio SMS webhook — signature verified, TCPA compliance",
  "escalation-routes": "Vapi escalation webhook — signature + rate limit verified",
  "billing-routes": "Stripe webhook — signature + idempotency verified (sub-path)",
  "health-routes": "Health probes — intentionally minimal public surface",
  "public-stats-routes": "Public statistics — intentionally public",
};

function analyzeRouteFile(filePath: string): RouteInfo {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);

  // Check for auth patterns
  const hasAuthenticateUser =
    content.includes("authenticateUser") && !content.includes("// authenticateUser");
  const hasRequirePermission = content.includes("requirePermission");
  const hasRequireRole = content.includes("requireRole");

  // Extract route mount points
  const routerMounts: string[] = [];
  const methodMatches = content.matchAll(
    /router\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g
  );
  for (const match of methodMatches) {
    routerMounts.push(match[2]);
  }

  // Determine route prefix from first mount or file conventions
  let routePrefix = routerMounts[0] || "/api/unknown";
  if (routePrefix.startsWith("/")) {
    // Keep as-is
  } else if (routePrefix.startsWith("\"")) {
    routePrefix = routePrefix.slice(1, -1);
  }

  // Check if publicly documented
  const baseName = fileName.replace(".ts", "");
  const isPubliclyDocumented =
    PUBLICLY_DOCUMENTED_PATHS.has(routePrefix) ||
    PUBLIC_REASONS[baseName] !== undefined ||
    fileName.includes("public") ||
    fileName.includes("auth-routes") || // Auth flows are obviously public
    fileName.includes("oauth");

  const publicReason =
    PUBLIC_REASONS[baseName] ||
    (fileName.includes("auth") ? "Authentication flows — must be public" : undefined);

  return {
    file: fileName,
    routePrefix,
    methods: [...new Set([...content.matchAll(/router\.(get|post|put|delete|patch)/g)].map((m) => m[1]))],
    hasAuthenticateUser,
    hasRequirePermission,
    hasRequireRole,
    isPubliclyDocumented,
    publicReason,
  };
}

function generateMatrix(routes: RouteInfo[]): string {
  const now = new Date().toISOString();

  let markdown = `# Authorization Matrix — Generated ${now}\n\n`;
  markdown += `> **Owner-grade security requirement:** Every route must either:\n`;
  markdown += `> 1. Use \`authenticateUser\` middleware, OR\n`;
  markdown += `> 2. Be explicitly documented as public with security justification\n\n`;

  // Group by protection status
  const protectedRoutes = routes.filter(
    (r) => r.hasAuthenticateUser || r.hasRequirePermission || r.hasRequireRole
  );
  const publicRoutes = routes.filter((r) => r.isPubliclyDocumented);
  const unprotectedRoutes = routes.filter(
    (r) =>
      !r.hasAuthenticateUser &&
      !r.hasRequirePermission &&
      !r.hasRequireRole &&
      !r.isPubliclyDocumented
  );

  markdown += `## Summary\n\n`;
  markdown += `- **Total route modules:** ${routes.length}\n`;
  markdown += `- **Protected (auth required):** ${protectedRoutes.length}\n`;
  markdown += `- **Public (documented):** ${publicRoutes.length}\n`;
  markdown += `- **⚠️ UNPROTECTED:** ${unprotectedRoutes.length}\n\n`;

  if (unprotectedRoutes.length > 0) {
    markdown += `## 🚨 UNPROTECTED ROUTES (CI FAILURE)\n\n`;
    markdown += `| File | Route Prefix | Status |\n`;
    markdown += `|------|--------------|--------|\n`;
    for (const route of unprotectedRoutes) {
      markdown += `| ${route.file} | ${route.routePrefix} | **UNPROTECTED** |\n`;
    }
    markdown += `\n`;
  }

  markdown += `## Protected Routes\n\n`;
  markdown += `| File | Route Prefix | Auth Method | RBAC |\n`;
  markdown += `|------|--------------|-------------|------|\n`;
  for (const route of protectedRoutes) {
    const authMethods = [
      route.hasAuthenticateUser && "authenticateUser",
      route.hasRequirePermission && "requirePermission",
      route.hasRequireRole && "requireRole",
    ]
      .filter(Boolean)
      .join(", ");
    const rbac = route.hasRequirePermission || route.hasRequireRole ? "✅" : "—";
    markdown += `| ${route.file} | ${route.routePrefix} | ${authMethods} | ${rbac} |\n`;
  }

  markdown += `\n## Public Routes (Documented)\n\n`;
  markdown += `| File | Route Prefix | Security Justification |\n`;
  markdown += `|------|--------------|------------------------|\n`;
  for (const route of publicRoutes) {
    markdown += `| ${route.file} | ${route.routePrefix} | ${route.publicReason || "N/A"} |\n`;
  }

  markdown += `\n## CI Enforcement\n\n`;
  markdown += `This matrix is auto-generated. CI fails if:\n`;
  markdown += `- Any route file lacks authentication AND lacks public justification\n`;
  markdown += `- New routes are added without explicit auth or documentation\n\n`;

  return markdown;
}

function main(): void {
  console.log("🔍 Analyzing route authorization patterns...\n");

  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`❌ Routes directory not found: ${ROUTES_DIR}`);
    process.exit(1);
  }

  const routeFiles = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith("-routes.ts") && !f.includes(".test."))
    .map((f) => path.join(ROUTES_DIR, f));

  console.log(`Found ${routeFiles.length} route files`);

  const routes: RouteInfo[] = [];
  for (const filePath of routeFiles) {
    routes.push(analyzeRouteFile(filePath));
  }

  // Generate and write matrix
  const matrix = generateMatrix(routes);
  const outputPath = path.join(__dirname, "..", "AUTHZ_MATRIX.md");
  fs.writeFileSync(outputPath, matrix);
  console.log(`\n✅ Matrix written to: ${outputPath}`);

  // Check for violations
  const violations = routes.filter(
    (r) =>
      !r.hasAuthenticateUser &&
      !r.hasRequirePermission &&
      !r.hasRequireRole &&
      !r.isPubliclyDocumented
  );

  if (violations.length > 0) {
    console.error(`\n🚨 CI FAILURE: ${violations.length} unprotected routes found:`);
    for (const v of violations) {
      console.error(`   - ${v.file} (${v.routePrefix})`);
    }
    console.error(`\n   Fix: Add authenticateUser middleware or document public exemption`);
    process.exit(1);
  }

  console.log("\n✅ All routes properly protected or documented as public");
  process.exit(0);
}

main();
