import { execFileSync } from "node:child_process";
import { readStripeLaunchStatus } from "./lib/stripe-launch-readiness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { getPostgresConnectionConfig } from "../src/lib/postgres-tls.mjs";
import {
  canonicalRuntimeCommitFinding,
  resolveCanonicalProductionUrl,
} from "./lib/production-url.mjs";
import { readLaunchDeployment, resolveLaunchProvider } from "./lib/launch-deployment-status.mjs";
import {
  readTwilioPrepaidBalanceUsd,
  twilioFundingBlocker,
} from "./lib/twilio-funding-readiness.mjs";

const { Pool } = pg;
const root = resolve(import.meta.dirname, "..");
const outputArg = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputArg >= 0 && process.argv[outputArg + 1]
    ? process.argv[outputArg + 1]
    : "docs/LAUNCH_STATUS.generated.json",
);
const productionUrl = resolveCanonicalProductionUrl(process.env.WIRELINE_PRODUCTION_URL);
const canonicalOrigin = new URL(productionUrl).origin;
const productionProvider = resolveLaunchProvider(process.argv.slice(2));

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function jsonFetch(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
      sourceCommit: response.headers.get("x-wireline-source-commit"),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isCanonicalTwilioUsageAlertUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (
      parsed.protocol === "https:" &&
      parsed.origin === canonicalOrigin &&
      parsed.pathname === "/api/twilio-webhook/usage-alert" &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

async function launchReadiness() {
  const token = process.env.HEALTH_MONITOR_TOKEN?.trim();
  if (!token) return { status: "unknown", reason: "HEALTH_MONITOR_TOKEN not supplied" };
  const result = await jsonFetch(`${productionUrl}/api/health/launch-readiness`, {
    headers: { "x-monitor-token": token },
  });
  const capabilities = Array.isArray(result.body?.capabilities) ? result.body.capabilities : [];
  const deferred = new Set(
    Array.isArray(result.body?.deferred_checklist) ? result.body.deferred_checklist : [],
  );
  // Only hard launch_blockers fail GO. Capability blockers that are also on the
  // deferred checklist (e.g. Federal DNC) stay visible without vetoing launch.
  const hardBlockers = Array.isArray(result.body?.launch_blockers)
    ? result.body.launch_blockers
    : Array.isArray(result.body?.blockers)
      ? result.body.blockers
      : [];
  return {
    status: result.ok ? "ready" : "blocked",
    http_status: result.status,
    overall_score: result.body?.overall_score ?? null,
    blockers: hardBlockers.filter((item) => !deferred.has(item)),
    deferred_checklist: [...deferred],
    capabilities,
  };
}

async function canonicalRuntimeStatus(expectedCommit) {
  const result = await jsonFetch(`${productionUrl}/api/health/public`);
  const finding = canonicalRuntimeCommitFinding(result, expectedCommit);
  return {
    status: finding ? "blocked" : "ready",
    http_status: result.status,
    served_commit: result.sourceCommit || null,
    expected_commit: expectedCommit,
    finding,
  };
}

async function databaseStatus() {
  const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL)?.trim();
  if (!connectionString) return { status: "unknown", reason: "POSTGRES_URL not supplied" };
  const pool = new Pool({
    ...getPostgresConnectionConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS table_count,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public') AS index_count,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_table_count,
        EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'wireline_recap_artifacts'
            AND indexname = 'idx_wireline_recap_artifacts_agent_id'
        ) AS recap_agent_index_present
    `);
    return { status: "reachable", ...result.rows[0] };
  } catch (error) {
    return {
      status: "blocked",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await pool.end();
  }
}

async function twilioStatus() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return { status: "unknown", reason: "Twilio credentials not supplied" };
  const authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  const [balance, triggers] = await Promise.all([
    jsonFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: authorization },
    }),
    jsonFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Triggers.json?PageSize=100`,
      {
        headers: { Authorization: authorization },
      },
    ),
  ]);
  return {
    status: balance.ok && triggers.ok ? "reachable" : "blocked",
    prepaid_balance_usd: readTwilioPrepaidBalanceUsd(balance.body),
    usage_trigger_count: Array.isArray(triggers.body?.usage_triggers)
      ? triggers.body.usage_triggers.length
      : null,
    usage_triggers: Array.isArray(triggers.body?.usage_triggers)
      ? triggers.body.usage_triggers.map((trigger) => ({
          sid: trigger.sid,
          recurring: trigger.recurring,
          usage_category: trigger.usage_category,
          trigger_by: trigger.trigger_by,
          trigger_value: trigger.trigger_value,
          callback_url: trigger.callback_url,
          callback_method: trigger.callback_method,
        }))
      : [],
  };
}

const sourceCommit = git("rev-parse", "HEAD");
const sourceBranch = git("branch", "--show-current");
const worktreeClean = git("status", "--porcelain") === "";
const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...origin/main")
  .split(/\s+/)
  .map(Number);
const [readiness, canonicalRuntime, stripe, database, twilio, production] = await Promise.all([
  launchReadiness(),
  canonicalRuntimeStatus(sourceCommit),
  readStripeLaunchStatus({ env: process.env, jsonFetch, canonicalOrigin }),
  databaseStatus(),
  twilioStatus(),
  readLaunchDeployment({
    provider: productionProvider,
    productionUrl,
    expectedRevision: sourceCommit,
    readJson: jsonFetch,
  }),
]);

const blockers = [];
if (sourceBranch !== "main") blockers.push("source_branch_not_main");
if (!worktreeClean) blockers.push("source_worktree_dirty");
if (behind !== 0) blockers.push("source_behind_origin_main");
if (readiness.overall_score !== 100) blockers.push("launch_readiness_below_100");
if (canonicalRuntime.finding) blockers.push(canonicalRuntime.finding);
// The probe already computes reachability; nothing consumed it, so an
// unreadable balance or price (outage, rotated key, missing scope) produced a
// "blocked" Stripe status and still left the launch gate green.
//
// It is still one blocker, not six. When Stripe cannot be read, every
// downstream assertion below is unknown rather than false, and emitting them
// all told the operator that the brand, the portal, the webhook, the tax
// config, AND the annual price were each individually misconfigured — five
// wrong errands generated by one rotated key.
if (stripe.status !== "reachable") {
  blockers.push("stripe_not_reachable");
} else {
  if (stripe.public_catalog?.ready !== true) blockers.push("stripe_public_catalog_not_aligned");
  if (stripe.brand?.ready !== true) blockers.push("stripe_brand_not_wireline");
  if (stripe.customer_portal?.ready !== true) blockers.push("stripe_customer_portal_not_ready");
  if (stripe.webhook?.ready !== true) blockers.push("stripe_webhook_not_aligned");
  if (stripe.tax?.ready !== true) blockers.push("stripe_automatic_tax_not_ready");
}
// Distinguish "we looked and the index is gone" from "we could not look".
// Both used to emit recap_agent_index_missing, which names a specific missing
// index — so a connection timeout sent whoever read the NO-GO hunting for a
// schema problem that may not exist, while the actual fault (the database is
// unreachable from wherever this ran) went unnamed. An unverifiable check is
// still a blocker; it is just a different blocker.
if (database.status !== "reachable") {
  blockers.push("database_unreachable");
} else if (database.recap_agent_index_present !== true) {
  blockers.push("recap_agent_index_missing");
}
// Same rule as the database probe: a probe that could not run reports that it
// could not run. Reading an unreachable Twilio API as "balance depleted" and
// "usage triggers missing" sent an operator to top up an account and recreate
// alerts that were both already fine.
if (twilio.status !== "reachable") {
  blockers.push("twilio_unreachable");
} else {
  const fundingBlocker = twilioFundingBlocker(twilio.prepaid_balance_usd);
  if (fundingBlocker) blockers.push(fundingBlocker);
  const expectedTriggerValue = new Map([
    ["daily", Number(process.env.TWILIO_DAILY_USAGE_TRIGGER_USD || 25)],
    ["monthly", Number(process.env.TWILIO_MONTHLY_USAGE_TRIGGER_USD || 200)],
  ]);
  const twilioTriggerWindows = new Set(
    (twilio.usage_triggers || [])
      .filter(
        (trigger) =>
          trigger.usage_category === "totalprice" &&
          trigger.trigger_by === "price" &&
          trigger.callback_method === "POST" &&
          isCanonicalTwilioUsageAlertUrl(trigger.callback_url) &&
          Number(trigger.trigger_value) === expectedTriggerValue.get(trigger.recurring),
      )
      .map((trigger) => trigger.recurring),
  );
  if (!twilioTriggerWindows.has("daily") || !twilioTriggerWindows.has("monthly")) {
    blockers.push("twilio_usage_triggers_missing");
  }
}
// Render is the only production provider. The Vercel branch was retired (T1).
blockers.push(...production.blockers);
for (const item of readiness.blockers || []) {
  const label = typeof item === "string" ? item : item?.code || item?.capability;
  if (label) blockers.push(`readiness:${label}`);
}

const deferredChecklist = [
  ...new Set([
    ...(Array.isArray(readiness.deferred_checklist) ? readiness.deferred_checklist : []),
  ]),
];

const record = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  launch_decision: blockers.length ? "NO-GO" : "GO",
  blockers: [...new Set(blockers)],
  deferred_checklist: deferredChecklist,
  source: {
    branch: sourceBranch,
    commit: sourceCommit,
    origin_main_ahead: ahead,
    origin_main_behind: behind,
    worktree_clean: worktreeClean,
  },
  production,
  live_checks: { readiness, canonical_runtime: canonicalRuntime, stripe, database, twilio },
  runtime_policy: {
    managed_structured_chain:
      productionProvider === "render"
        ? ["xAI", "OpenAI"]
        : ["xAI", "OpenAI", "Vercel AI Gateway"],
    policy_sources: [
      "src/lib/reasoning-provider-policy.ts",
      "src/lib/ai-models.ts",
      "src/lib/voice/xai-voice-config.ts",
    ],
    observation: "Declared source policy; live provider execution requires separate workflow evidence",
    openai:
      "structured backup and OpenAI Realtime for authenticated browser rehearsal and default telephone routing",
    xai:
      "managed structured primary; phone voice only when configured and the number is registered with xAI",
    twilio: "carrier transport, numbers, SIP, and SMS only",
  },
  surface_posture: {
    web: "public self-serve candidate",
    browser_command: "early access",
    native: "internal_or_planned",
    mcp: "account-bound early access",
    whatsapp: "unavailable",
    live_video: "retired",
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({ output: outputPath, decision: record.launch_decision, blockers }, null, 2),
);
