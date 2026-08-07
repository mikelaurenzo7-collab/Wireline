import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const root = resolve(import.meta.dirname, "..");
const outputArg = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputArg >= 0 && process.argv[outputArg + 1]
    ? process.argv[outputArg + 1]
    : "docs/LAUNCH_STATUS.generated.json",
);
const productionUrl = (process.env.WIRELINE_PRODUCTION_URL || "https://trywireline.com").replace(
  /\/+$/,
  "",
);

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function jsonFetch(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
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

async function stripeStatus() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { status: "unknown", reason: "STRIPE_SECRET_KEY not supplied" };
  const priceId = process.env.STRIPE_STARTER_9_ANNUAL_PRICE_ID?.trim();
  const headers = { Authorization: `Bearer ${key}` };
  const [balanceResult, priceResult, accountResult, portalResult, webhookResult, taxResult] =
    await Promise.all([
      jsonFetch("https://api.stripe.com/v1/balance", { headers }),
      priceId
        ? jsonFetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
            headers,
          })
        : Promise.resolve({ ok: false, status: 0, body: null }),
      jsonFetch("https://api.stripe.com/v1/account", { headers }),
      jsonFetch("https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100", {
        headers,
      }),
      jsonFetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers }),
      jsonFetch("https://api.stripe.com/v1/tax/settings", { headers }),
    ]);

  const available = Array.isArray(balanceResult.body?.available)
    ? balanceResult.body.available.find((item) => item.currency === "usd")?.amount
    : null;
  const pending = Array.isArray(balanceResult.body?.pending)
    ? balanceResult.body.pending.find((item) => item.currency === "usd")?.amount
    : null;

  const publicName = String(
    accountResult.body?.business_profile?.name ||
      accountResult.body?.settings?.dashboard?.display_name ||
      "",
  ).trim();
  const statementDescriptor = String(
    accountResult.body?.settings?.payments?.statement_descriptor || "",
  )
    .trim()
    .toUpperCase();
  const origin = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" ? parsed.origin : null;
    } catch {
      return null;
    }
  };
  const websiteOrigin = origin(accountResult.body?.business_profile?.url);
  const supportOrigin = origin(accountResult.body?.business_profile?.support_url);
  const brandReady =
    /wireline/i.test(publicName) &&
    statementDescriptor.startsWith("WIRELINE") &&
    websiteOrigin === "https://trywireline.com" &&
    supportOrigin === "https://trywireline.com";

  const portalConfigurations = Array.isArray(portalResult.body?.data) ? portalResult.body.data : [];
  // Same selection rule as check-vendor-readiness.mjs: require the customer
  // controls first, then prefer the Wireline-managed configuration, so a bare
  // Dashboard default cannot mask the one the application actually uses.
  const portalHasCustomerControls = (configuration) =>
    configuration?.features?.payment_method_update?.enabled === true &&
    configuration?.features?.invoice_history?.enabled === true &&
    configuration?.features?.subscription_cancel?.enabled === true;
  const portalCandidates = portalConfigurations.filter(
    (configuration) => configuration?.active === true && portalHasCustomerControls(configuration),
  );
  const portalConfiguration =
    portalCandidates.find(
      (configuration) => configuration?.metadata?.wireline_managed === "true",
    ) || portalCandidates.find((configuration) => configuration?.is_default === true);
  const portalFeatures = portalConfiguration?.features ?? {};
  const portalReady = Boolean(portalResult.ok && portalConfiguration);

  const expectedWebhookEvents = [
    "charge.dispute.created",
    "charge.refunded",
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
  ];
  const webhookEndpoints = Array.isArray(webhookResult.body?.data) ? webhookResult.body.data : [];
  const webhook = webhookEndpoints.find(
    (endpoint) =>
      endpoint?.status === "enabled" &&
      String(endpoint?.url || "").replace(/\/+$/, "") ===
        "https://trywireline.com/api/stripe-webhook",
  );
  const enabledWebhookEvents = Array.isArray(webhook?.enabled_events)
    ? [...webhook.enabled_events].sort()
    : [];
  const missingWebhookEvents = expectedWebhookEvents.filter(
    (event) => !enabledWebhookEvents.includes(event),
  );
  const extraWebhookEvents = enabledWebhookEvents.filter(
    (event) => event !== "*" && !expectedWebhookEvents.includes(event),
  );
  const webhookReady = Boolean(
    webhook && missingWebhookEvents.length === 0 && extraWebhookEvents.length === 0,
  );
  const taxReady = Boolean(taxResult.ok && taxResult.body?.status === "active");

  return {
    status:
      balanceResult.ok &&
      priceResult.ok &&
      accountResult.ok &&
      portalResult.ok &&
      webhookResult.ok &&
      taxResult.ok
        ? "reachable"
        : "blocked",
    available_usd: typeof available === "number" ? available / 100 : null,
    pending_usd: typeof pending === "number" ? pending / 100 : null,
    starter_annual: {
      price_id: priceId || null,
      unit_amount_usd:
        typeof priceResult.body?.unit_amount === "number"
          ? priceResult.body.unit_amount / 100
          : null,
      active: priceResult.body?.active === true,
      livemode: priceResult.body?.livemode === true,
      lookup_key: priceResult.body?.lookup_key ?? null,
    },
    brand: {
      public_name: publicName || null,
      statement_descriptor_ready: statementDescriptor.startsWith("WIRELINE"),
      website_origin: websiteOrigin,
      support_origin: supportOrigin,
      ready: brandReady,
    },
    customer_portal: {
      managed_or_default_present: Boolean(portalConfiguration),
      payment_method_update: portalFeatures.payment_method_update?.enabled === true,
      invoice_history: portalFeatures.invoice_history?.enabled === true,
      subscription_cancel: portalFeatures.subscription_cancel?.enabled === true,
      ready: portalReady,
    },
    webhook: {
      endpoint_present: Boolean(webhook),
      missing_events: missingWebhookEvents,
      extra_events: extraWebhookEvents,
      ready: webhookReady,
    },
    tax: {
      status: taxResult.body?.status ?? null,
      ready: taxReady,
    },
  };
}

async function databaseStatus() {
  const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL)?.trim();
  if (!connectionString) return { status: "unknown", reason: "POSTGRES_URL not supplied" };
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
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
    prepaid_balance_usd: Number.isFinite(Number(balance.body?.balance))
      ? Number(balance.body.balance)
      : null,
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
        }))
      : [],
  };
}

async function vercelStatus() {
  const token = process.env.VERCEL_ACCESS_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !teamId || !projectId) {
    return { status: "unknown", reason: "Vercel read credentials not supplied" };
  }
  const query = new URLSearchParams({ projectId, teamId, target: "production", limit: "10" });
  const headers = { Authorization: `Bearer ${token}` };
  const [deploymentResult, environmentResult] = await Promise.all([
    jsonFetch(`https://api.vercel.com/v6/deployments?${query}`, { headers }),
    jsonFetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?${new URLSearchParams({ teamId })}`,
      { headers },
    ),
  ]);
  const deployment = Array.isArray(deploymentResult.body?.deployments)
    ? deploymentResult.body.deployments.find((item) => item.state === "READY")
    : null;
  const environments = Array.isArray(environmentResult.body?.envs)
    ? environmentResult.body.envs
    : [];
  const keyRecords = new Map();
  for (const item of environments) {
    if (!keyRecords.has(item.key)) keyRecords.set(item.key, []);
    keyRecords.get(item.key).push(item);
  }
  const requiredParityKeys = [
    "OAUTH_BRIDGE_SECRET",
    "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    "HEALTH_MONITOR_TOKEN",
  ];
  // Production is the only required target. scripts/check-deployment-boundaries.mjs
  // fails every preview build that can see credential-like configuration or the
  // production Stripe catalog, so demanding preview/development coverage here
  // made this gate and the build-time boundary gate mutually unsatisfiable.
  const requiredTargets = ["production"];
  const parityGaps = requiredParityKeys.flatMap((key) => {
    const targets = new Set((keyRecords.get(key) || []).flatMap((item) => item.target || []));
    return requiredTargets
      .filter((target) => !targets.has(target))
      .map((target) => `${key}:${target}`);
  });
  const secretKeyPattern = /(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|DATABASE_URL|POSTGRES_URL)$/i;
  const potentiallyUnencryptedSecretKeys = environments
    .filter(
      (item) => secretKeyPattern.test(item.key) && !["encrypted", "sensitive"].includes(item.type),
    )
    .map((item) => item.key);
  const overlappingDuplicateKeys = [...keyRecords.entries()]
    .filter(([, items]) => {
      const seen = new Set();
      return items.some((item) =>
        (item.target || []).some((target) => {
          if (seen.has(target)) return true;
          seen.add(target);
          return false;
        }),
      );
    })
    .map(([key]) => key);
  return {
    status: deploymentResult.ok && environmentResult.ok && deployment ? "ready" : "blocked",
    deployment_id: deployment?.uid ?? null,
    production_commit: deployment?.meta?.githubCommitSha ?? null,
    environment_audit: {
      record_count: environments.length,
      unique_key_count: keyRecords.size,
      production_record_count: environments.filter((item) => item.target?.includes("production"))
        .length,
      preview_record_count: environments.filter((item) => item.target?.includes("preview")).length,
      development_record_count: environments.filter((item) => item.target?.includes("development"))
        .length,
      duplicate_keys: [...keyRecords.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([key]) => key),
      overlapping_duplicate_keys: overlappingDuplicateKeys,
      parity_gaps: parityGaps,
      potentially_unencrypted_secret_keys: [...new Set(potentiallyUnencryptedSecretKeys)],
    },
  };
}

const sourceCommit = git("rev-parse", "HEAD");
const sourceBranch = git("branch", "--show-current");
const worktreeClean = git("status", "--porcelain") === "";
const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...origin/main")
  .split(/\s+/)
  .map(Number);
const [readiness, stripe, database, twilio, vercel] = await Promise.all([
  launchReadiness(),
  stripeStatus(),
  databaseStatus(),
  twilioStatus(),
  vercelStatus(),
]);

const blockers = [];
if (sourceBranch !== "main") blockers.push("source_branch_not_main");
if (!worktreeClean) blockers.push("source_worktree_dirty");
if (behind !== 0) blockers.push("source_behind_origin_main");
if (readiness.overall_score !== 100) blockers.push("launch_readiness_below_100");
if (
  stripe.starter_annual?.unit_amount_usd !== 190 ||
  stripe.starter_annual?.active !== true ||
  stripe.starter_annual?.livemode !== true
) {
  blockers.push("starter_annual_price_not_live_190");
}
// The probe already computes reachability; nothing consumed it, so an
// unreadable balance or price (outage, rotated key, missing scope) produced a
// "blocked" Stripe status and still left the launch gate green.
if (stripe.status !== "reachable") blockers.push("stripe_not_reachable");
if (stripe.brand?.ready !== true) blockers.push("stripe_brand_not_wireline");
if (stripe.customer_portal?.ready !== true) blockers.push("stripe_customer_portal_not_ready");
if (stripe.webhook?.ready !== true) blockers.push("stripe_webhook_not_aligned");
if (stripe.tax?.ready !== true) blockers.push("stripe_tax_not_active");
if (database.recap_agent_index_present !== true) blockers.push("recap_agent_index_missing");
if (typeof twilio.prepaid_balance_usd !== "number" || twilio.prepaid_balance_usd < 150) {
  blockers.push("twilio_prepaid_balance_below_150");
}
const twilioTriggerWindows = new Set(
  (twilio.usage_triggers || [])
    .filter(
      (trigger) =>
        trigger.usage_category === "totalprice" &&
        trigger.trigger_by === "price" &&
        typeof trigger.callback_url === "string" &&
        trigger.callback_url.endsWith("/api/twilio-webhook/usage-alert"),
    )
    .map((trigger) => trigger.recurring),
);
if (!twilioTriggerWindows.has("daily") || !twilioTriggerWindows.has("monthly")) {
  blockers.push("twilio_usage_triggers_missing");
}
if (vercel.production_commit !== sourceCommit) blockers.push("production_commit_mismatch");
if ((vercel.environment_audit?.parity_gaps || []).length > 0) {
  blockers.push("vercel_required_env_scope_gap");
}
if ((vercel.environment_audit?.potentially_unencrypted_secret_keys || []).length > 0) {
  blockers.push("vercel_potential_unencrypted_secret");
}
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
  production: vercel,
  live_checks: { readiness, stripe, database, twilio },
  runtime_policy: {
    managed_structured_chain: ["OpenAI", "Gemini", "Vercel AI Gateway"],
    openai:
      "primary managed structured runtime (GPT-5.6 Terra) and OpenAI Realtime for Studio/ChatGPT/guest demos",
    xai: "optional experiment only; structured fallback requires WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
  },
  surface_posture: {
    web: "public self-serve candidate",
    browser_command: "early access",
    native: "internal_or_planned",
    mcp: "account-bound early access",
    whatsapp: "unavailable",
    live_video: "gated_add_on",
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({ output: outputPath, decision: record.launch_decision, blockers }, null, 2),
);
