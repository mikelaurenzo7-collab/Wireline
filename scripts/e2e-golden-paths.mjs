#!/usr/bin/env node
/**
 * E2E Golden-Path Smoke Tests
 *
 * Validates critical user flows against a running Wireline server.
 * Requires: a running server at BASE_URL (default http://localhost:5173)
 * and valid Supabase credentials for a test user.
 *
 * Env:
 *   E2E_BASE_URL     — server base URL (default: http://localhost:5173)
 *   E2E_USER_EMAIL   — test user email
 *   E2E_USER_PASSWORD — test user password
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — required for sign-in (same project as deployment)
 *   CRON_SECRET      — optional; if set and length >= 16, POST /api/jobs/sweep is tested with Bearer auth
 *
 * Usage:
 *   node scripts/e2e-golden-paths.mjs
 *
 * Exit 0 if all golden paths pass, exit 1 otherwise.
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;

let token = null;
let passed = 0;
let failed = 0;

async function req(method, path, body, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...opts.headers };
  // Allow opts.headers.Authorization (e.g. CRON_SECRET) without clobbering from session JWT.
  if (token && !headers.Authorization) headers["Authorization"] = `Bearer ${token}`;

  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ─── 1. Health check (no auth) ─────────────────────────────────────────────
async function testHealth() {
  console.log("\n[1] Health check");
  const { status, json } = await req("GET", "/api/health");
  assert("GET /api/health returns 200 or 503", status === 200 || status === 503);
  assert("Response has status field", json && typeof json.status === "string");
}

// ─── 2. Public endpoints ───────────────────────────────────────────────────
async function testPublicEndpoints() {
  console.log("\n[2] Public endpoints (no auth)");

  const { status: planStatus, json: plans } = await req("GET", "/api/billing/plans");
  assert("GET /api/billing/plans returns 200", planStatus === 200);
  assert("Plans array is present", plans && Array.isArray(plans.plans));

  const { status: specStatus, json: spec } = await req("GET", "/api/openapi.json");
  assert("GET /api/openapi.json returns 200", specStatus === 200);
  assert("OpenAPI spec has openapi field", spec && spec.openapi === "3.1.0");
}

// ─── 3. Auth-required endpoints reject unauthenticated requests ────────────
async function testAuthGates() {
  console.log("\n[3] Auth gates (should reject without token)");
  const savedToken = token;
  token = null;

  const endpoints = [
    ["GET", "/api/calls"],
    ["GET", "/api/settings"],
    ["GET", "/api/emails/accounts"],
    ["GET", "/api/webhooks"],
    ["GET", "/api/export/calls.csv"],
  ];

  for (const [method, path] of endpoints) {
    const { status } = await req(method, path);
    assert(`${method} ${path} returns 401`, status === 401, `got ${status}`);
  }

  token = savedToken;
}

// ─── 4. Authenticated golden paths ────────────────────────────────────────
async function testAuthenticated() {
  if (!token) {
    console.log("\n[4] Authenticated paths — SKIPPED (no credentials)");
    return;
  }

  console.log("\n[4] Authenticated golden paths");

  // Settings
  const { status: settingsStatus, json: settings } = await req("GET", "/api/settings");
  assert("GET /api/settings returns 200", settingsStatus === 200, `got ${settingsStatus}`);

  // Agent list
  const { status: agentsStatus, json: agents } = await req("GET", "/api/agents");
  assert("GET /api/agents returns 200", agentsStatus === 200, `got ${agentsStatus}`);

  // Calls
  const { status: callsStatus, json: calls } = await req("GET", "/api/calls");
  assert("GET /api/calls returns 200", callsStatus === 200, `got ${callsStatus}`);

  // Email accounts
  const { status: emailStatus } = await req("GET", "/api/emails/accounts");
  assert("GET /api/emails/accounts returns 200", emailStatus === 200, `got ${emailStatus}`);

  // CSV export
  const { status: exportStatus, headers: exportHeaders } = await req("GET", "/api/export/calls.csv");
  assert("GET /api/export/calls.csv returns 200", exportStatus === 200, `got ${exportStatus}`);

  // Webhooks
  const { status: whStatus, json: webhooks } = await req("GET", "/api/webhooks");
  assert("GET /api/webhooks returns 200", whStatus === 200, `got ${whStatus}`);
  assert("Webhooks response has available_events", webhooks && Array.isArray(webhooks.available_events));

  // Triage inbox
  const { status: triageStatus } = await req("GET", "/api/triage");
  assert("GET /api/triage returns 200", triageStatus === 200, `got ${triageStatus}`);

  // Nav counts
  const { status: navStatus } = await req("GET", "/api/nav-counts");
  assert("GET /api/nav-counts returns 200", navStatus === 200, `got ${navStatus}`);

  // Claude status
  const { status: claudeStatus, json: claude } = await req("GET", "/api/claude/status");
  assert("GET /api/claude/status returns 200", claudeStatus === 200, `got ${claudeStatus}`);
  assert("Claude status has available field", claude && typeof claude.available === "boolean");

  // Platform Health API (authenticated integrations registry)
  const { status: integStatus, json: integ } = await req("GET", "/api/health/integrations");
  assert("GET /api/health/integrations returns 200", integStatus === 200, `got ${integStatus}`);
  assert(
    "Health integrations payload has integrations array",
    integ && Array.isArray(integ.integrations),
    integ ? "missing integrations[]" : "no json",
  );

  // Job queue stats (tenant-scoped)
  const { status: jobStatsStatus, json: jobStats } = await req("GET", "/api/jobs/stats");
  assert("GET /api/jobs/stats returns 200", jobStatsStatus === 200, `got ${jobStatsStatus}`);
  assert(
    "Job stats is an object",
    jobStats && typeof jobStats === "object" && !Array.isArray(jobStats),
    typeof jobStats,
  );
}

// ─── 5. Intake API (key-authenticated) ────────────────────────────────────
async function testIntake() {
  console.log("\n[5] Intake API (public + key-authenticated)");

  // Without key should return 401
  const { status } = await req("POST", "/api/intake/lead", {
    customer_number: "+15551234567",
    customer_name: "E2E Test Lead",
  }, { headers: {} });
  assert("POST /api/intake/lead without key returns 401", status === 401, `got ${status}`);
}

// ─── 6. Cron sweep (optional; uses CRON_SECRET, not user JWT) ─────────────
async function testCronSweep() {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) {
    console.log("\n[6] Cron sweep — SKIPPED (CRON_SECRET unset or shorter than 16 chars)");
    return;
  }

  console.log("\n[6] Cron sweep (Bearer CRON_SECRET)");
  const saved = token;
  token = null;
  const { status, json } = await req("POST", "/api/jobs/sweep", undefined, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  token = saved;

  assert("POST /api/jobs/sweep returns 200", status === 200, `got ${status}`);
  assert(
    "Sweep response is JSON object with processed field",
    json && typeof json === "object" && typeof json.processed === "number",
    json ? JSON.stringify(json).slice(0, 120) : "no body",
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nWireline E2E Golden-Path Smoke Tests`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Auth: ${EMAIL ? `${EMAIL} (credentials provided)` : "no credentials (auth tests skipped)"}`);

  // Authenticate if credentials provided
  if (EMAIL && PASSWORD) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
        if (error) {
          console.error(`  Auth failed: ${error.message}`);
        } else {
          token = data.session.access_token;
          console.log("  Authenticated successfully.");
        }
      }
    } catch (e) {
      console.error(`  Auth setup failed: ${e.message}`);
    }
  }

  await testHealth();
  await testPublicEndpoints();
  await testAuthGates();
  await testAuthenticated();
  await testIntake();
  await testCronSweep();

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("✓ All golden paths verified.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
