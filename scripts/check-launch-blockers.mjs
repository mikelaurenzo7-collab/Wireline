#!/usr/bin/env node
/* eslint-disable no-console -- launch gate CLI output */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const strictMode = process.env.PRODUCTION_CHECK === "1" || process.env.LAUNCH_GATE_STRICT === "1";

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

function issue(message, { strict = false } = {}) {
  if (strict || strictMode) fail(message);
  else warn(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "coverage", ".turbo"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function checkNodeRuntime() {
  const pkg = JSON.parse(readText("package.json"));
  const vercel = JSON.parse(readText("vercel.json"));
  const engine = String(pkg.engines?.node ?? "");

  if (/22/.test(engine) && !/>=20/.test(engine)) {
    pass(`package.json narrows launch runtime to ${engine}`);
  } else {
    issue(`package.json engines.node is ${engine || "unset"}; launch should narrow to Node 22 once local/dev runners are ready`);
  }

  if (vercel.build?.env?.NODE_VERSION === "22") pass("vercel.json build env pins Node 22");
  else fail("vercel.json build.env.NODE_VERSION must be 22");

  const major = Number(process.versions.node.split(".")[0]);
  if (major === 22) pass("current runtime is Node 22");
  else issue(`current runtime is Node ${process.versions.node}; production launch checks should run on Node 22`);
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
    const files = walkFiles(clientRoot, (file) => /\.(ts|tsx|js|jsx|kt|kts|swift|json|md|mjs|cjs|html)$/.test(file));
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (forbidden.some((pattern) => pattern.test(text))) offenders.push(path.relative(root, file));
    }
  }

  if (offenders.length) fail(`client surfaces reference server-owned secrets: ${[...new Set(offenders)].join(", ")}`);
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

  const files = walkFiles(root, (file) => /\.(ts|tsx|js|jsx|md|html|json)$/.test(file));
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    if (allowlist.has(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (claimPatterns.some((pattern) => pattern.test(text))) offenders.push(rel);
  }

  if (offenders.length) fail(`hard-cap or minute claims need review: ${[...new Set(offenders)].join(", ")}`);
  else pass("no broad unlimited/minute hard-cap claims found outside allowlist");
}

function checkBillingCatalogShape() {
  const catalog = readText("src/lib/plan-catalog.ts");
  const envCheck = readText("scripts/check-prod-env.mjs");

  if (catalog.includes("capacity_plus_conversation_balance")) {
    pass("public catalog uses capacity plus Conversation Balance pricing model");
  } else {
    fail("public catalog must expose capacity_plus_conversation_balance pricing model");
  }

  if (catalog.includes("public: false") && catalog.includes("id: \"personal\"")) {
    pass("Personal remains hidden from recurring public acquisition catalog");
  } else {
    warn("confirm Personal is top-up-led and not sold as a recurring acquisition plan");
  }

  const requiredStripeEnv = [
    "STRIPE_BUSINESS_STARTER_PRICE_ID",
    "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
    "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
    "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
    "STRIPE_PRO_OVERAGE_PRICE_ID",
  ];
  const missingEnvChecks = requiredStripeEnv.filter((key) => !envCheck.includes(key));
  if (missingEnvChecks.length) fail(`production env check is missing Stripe launch envs: ${missingEnvChecks.join(", ")}`);
  else pass("production env check covers Team/Business Stripe price mappings");
}

async function checkDatabaseLaunchState() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    issue("POSTGRES_URL/DATABASE_URL unavailable; skipped live database launch checks");
    return;
  }

  const { Pool } = await import("pg");
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
      if (unpaid.rows.length) fail(`active non-Stripe entitlements without explicit provenance: ${unpaid.rows.length}`);
      else pass("active non-Stripe entitlements are explicitly classified");

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
            'wireline_oauth_pending_codes',
            'wireline_credit_ledger'
          )
          AND NOT EXISTS (
            SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary
          )
        ORDER BY c.relname
      `);
      if (missingPk.rows.length) fail(`Supabase launch tables still missing PKs: ${missingPk.rows.map((r) => r.table_name).join(", ")}`);
      else pass("Supabase launch tables have primary keys");
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
