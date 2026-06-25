#!/usr/bin/env node
/* eslint-disable no-console -- launch gate CLI output */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const productionMode = process.env.PRODUCTION_CHECK === "1" || process.env.LAUNCH_GATE_STRICT === "1";

const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function warn(message) {
  warnings.push(message);
}

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function checkNodeRuntime() {
  const pkg = JSON.parse(readText("package.json"));
  const expected = "22.x";
  if (pkg.engines?.node !== expected) fail(`package.json engines.node must be ${expected}`);
  else pass("package.json requires Node 22.x");

  const vercel = JSON.parse(readText("vercel.json"));
  if (vercel.build?.env?.NODE_VERSION !== "22") fail("vercel.json build.env.NODE_VERSION must be 22");
  else pass("vercel build env pins Node 22");

  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 22) {
    const message = `current runtime is Node ${process.versions.node}; launch builds must run on Node 22`;
    productionMode ? fail(message) : warn(message);
  } else {
    pass("current runtime is Node 22");
  }
}

function checkThinClientBoundaries() {
  const clientRoots = ["apps/browser-extension", "ios", "android"].map((p) => path.join(root, p));
  const forbidden = [
    /STRIPE_SECRET_KEY/,
    /STRIPE_WEBHOOK_SECRET/,
    /OPENAI_API_KEY/,
    /ANTHROPIC_API_KEY/,
    /ELEVENLABS_API_KEY/,
    /VAPI_PRIVATE_KEY/,
    /SUPABASE_SERVICE_ROLE/i,
    /service_role/i,
  ];

  const offenders = [];
  for (const clientRoot of clientRoots) {
    const files = walkFiles(
      clientRoot,
      (file) => /\.(ts|tsx|js|jsx|kt|kts|swift|json|md|mjs|cjs)$/.test(file),
    );
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (forbidden.some((pattern) => pattern.test(text))) {
        offenders.push(path.relative(root, file));
      }
    }
  }

  if (offenders.length) fail(`client surfaces reference server-owned secrets: ${offenders.join(", ")}`);
  else pass("browser/native clients do not reference server-owned secret names");
}

function checkHardCapClaims() {
  const claimPatterns = [
    /unlimited\s+(voice|calls|minutes|usage)/i,
    /included\s+voice\s+minutes/i,
    /free\s+unlimited/i,
    /no\s+overages/i,
  ];
  const allowlist = new Set([
    "src/lib/plan-catalog.ts",
    "scripts/check-launch-blockers.mjs",
    "docs/LAUNCH_EXECUTION_GATES.md",
  ]);

  const files = walkFiles(
    root,
    (file) => /\.(ts|tsx|js|jsx|md|html|json)$/.test(file) && !file.includes(`${path.sep}node_modules${path.sep}`),
  );
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    if (allowlist.has(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (claimPatterns.some((pattern) => pattern.test(text))) offenders.push(rel);
  }

  if (offenders.length) {
    fail(`hard-cap or minute claims need review: ${[...new Set(offenders)].join(", ")}`);
  } else {
    pass("no broad unlimited/minute hard-cap claims found outside allowlist");
  }
}

function checkBillingCatalogShape() {
  const catalog = readText("src/lib/plan-catalog.ts");
  if (!catalog.includes("platform_plus_conversation_balance")) {
    fail("public plan catalog must expose platform_plus_conversation_balance pricing model");
  } else {
    pass("public catalog names platform plus Conversation Balance pricing model");
  }

  if (!catalog.includes("public: false")) {
    warn("legacy plan hiding marker not found; confirm personal legacy plans are not public acquisition plans");
  } else {
    pass("legacy plan records can be hidden from public acquisition catalog");
  }
}

async function checkDatabaseLaunchState() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    const message = "POSTGRES_URL/DATABASE_URL unavailable; skipped live database launch checks";
    productionMode ? fail(message) : warn(message);
    return;
  }

  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      const unpaid = await client.query(`
        SELECT user_id, plan, status, entitlement_source, grant_reason
        FROM public.wireline_subscriptions
        WHERE status IN ('active', 'trialing')
          AND (stripe_customer_id IS NULL OR stripe_subscription_id IS NULL)
          AND NOT (
            entitlement_source IN ('demo', 'internal', 'manual', 'migration', 'trial')
            AND COALESCE(grant_reason, '') <> ''
          )
        LIMIT 20
      `);
      if (unpaid.rows.length) {
        fail(`active non-Stripe entitlements without explicit provenance: ${unpaid.rows.length}`);
      } else {
        pass("active non-Stripe entitlements are explicitly classified");
      }

      const missingPk = await client.query(`
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname IN (
            'wireline_training_backup_20260609',
            'wireline_onboarding_progress',
            'wireline_quota_usage',
            'wireline_oauth_pending_codes'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_index i
            WHERE i.indrelid = c.oid
              AND i.indisprimary
          )
        ORDER BY c.relname
      `);
      if (missingPk.rows.length) {
        fail(`Supabase primary-key advisor tables still missing PKs: ${missingPk.rows.map((r) => r.table_name).join(", ")}`);
      } else {
        pass("Supabase primary-key advisor tables now have primary keys");
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function printSection(title, items) {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const item of items) console.log(`  - ${item}`);
}

async function main() {
  console.log("Wireline launch blocker gate\n");
  checkNodeRuntime();
  checkThinClientBoundaries();
  checkHardCapClaims();
  checkBillingCatalogShape();
  await checkDatabaseLaunchState();

  printSection("Passes", passes);
  printSection("Warnings", warnings);
  printSection("Failures", failures);

  if (failures.length) {
    console.log("\nLaunch blocker gate failed.");
    process.exit(1);
  }

  console.log("\nLaunch blocker gate passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
