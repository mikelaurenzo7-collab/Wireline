import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { getHandledStripeWebhookEvents } from "./lib/stripe-handled-events.mjs";
import {
  STRIPE_BRAND_PRIMARY_COLOR,
  STRIPE_BRAND_SECONDARY_COLOR,
  STRIPE_PUBLIC_BRAND,
  STRIPE_PUBLIC_SUPPORT_EMAIL,
  STRIPE_PUBLIC_SUPPORT_URL,
  hasWirelineDescriptor,
} from "./lib/stripe-account-identity.mjs";
import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
  PUBLIC_SELF_SERVE_PLAN_IDS,
} from "./lib/stripe-founder-catalog.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import {
  CANONICAL_PROJECT_ID,
  CANONICAL_TEAM_ID,
  resolveVercelToken,
} from "./lib/vercel-project.mjs";
import {
  canonicalRuntimeCommitFinding,
  resolveCanonicalProductionUrl,
} from "./lib/production-url.mjs";

const { Pool } = pg;
const PINNED_STRIPE_API_VERSION = "2026-07-29.dahlia";
const root = resolve(import.meta.dirname, "..");
const outputArg = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputArg >= 0 && process.argv[outputArg + 1]
    ? process.argv[outputArg + 1]
    : "docs/LAUNCH_STATUS.generated.json",
);
const productionUrl = resolveCanonicalProductionUrl(process.env.WIRELINE_PRODUCTION_URL);

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
      parsed.origin === "https://trywireline.com" &&
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

async function stripeStatus() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { status: "unknown", reason: "STRIPE_SECRET_KEY not supplied" };
  const headers = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": PINNED_STRIPE_API_VERSION,
  };
  const publicPlanIds = new Set(PUBLIC_SELF_SERVE_PLAN_IDS);
  const publicCatalogPrices = FOUNDER_PRICES.filter(
    (price) => price.recurring && publicPlanIds.has(price.metadata?.wireline_plan_id),
  );
  const catalogParams = new URLSearchParams({ active: "true", limit: "100" });
  for (const price of publicCatalogPrices) catalogParams.append("lookup_keys[]", price.lookupKey);
  catalogParams.append("expand[]", "data.product");
  const productByKey = new Map(FOUNDER_PRODUCTS.map((product) => [product.key, product]));
  const [
    balanceResult,
    catalogPriceResult,
    accountResult,
    portalResult,
    webhookResult,
    taxResult,
    taxRegistrationsResult,
  ] = await Promise.all([
    jsonFetch("https://api.stripe.com/v1/balance", { headers }),
    jsonFetch(`https://api.stripe.com/v1/prices?${catalogParams.toString()}`, { headers }),
    jsonFetch("https://api.stripe.com/v1/account", { headers }),
    jsonFetch("https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100", {
      headers,
    }),
    jsonFetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers }),
    jsonFetch("https://api.stripe.com/v1/tax/settings", { headers }),
    jsonFetch("https://api.stripe.com/v1/tax/registrations?status=active&limit=100", {
      headers,
    }),
  ]);

  const available = Array.isArray(balanceResult.body?.available)
    ? balanceResult.body.available.find((item) => item.currency === "usd")?.amount
    : null;
  const pending = Array.isArray(balanceResult.body?.pending)
    ? balanceResult.body.pending.find((item) => item.currency === "usd")?.amount
    : null;

  const liveCatalogPrices = Array.isArray(catalogPriceResult.body?.data)
    ? catalogPriceResult.body.data
    : [];
  const catalogFindings = [];
  for (const expected of publicCatalogPrices) {
    const matches = liveCatalogPrices.filter((price) => price?.lookup_key === expected.lookupKey);
    if (matches.length !== 1) {
      catalogFindings.push(
        `${expected.lookupKey}:expected_one_active_price_found_${matches.length}`,
      );
      continue;
    }
    const [actual] = matches;
    if (actual.active !== true) catalogFindings.push(`${expected.lookupKey}:inactive`);
    if (actual.livemode !== true) catalogFindings.push(`${expected.lookupKey}:not_livemode`);
    if (actual.currency !== "usd") catalogFindings.push(`${expected.lookupKey}:currency_not_usd`);
    if (actual.unit_amount !== expected.unitAmount) {
      catalogFindings.push(
        `${expected.lookupKey}:amount_${actual.unit_amount}_expected_${expected.unitAmount}`,
      );
    }
    if (actual.recurring?.interval !== expected.recurring.interval) {
      catalogFindings.push(
        `${expected.lookupKey}:interval_${actual.recurring?.interval || "missing"}_expected_${expected.recurring.interval}`,
      );
    }
    if (actual.billing_scheme !== "per_unit") {
      catalogFindings.push(`${expected.lookupKey}:billing_scheme_not_per_unit`);
    }
    if (actual.recurring?.interval_count !== 1) {
      catalogFindings.push(`${expected.lookupKey}:interval_count_not_one`);
    }
    if (actual.recurring?.trial_period_days != null) {
      catalogFindings.push(`${expected.lookupKey}:unexpected_price_trial`);
    }
    if (actual.recurring?.usage_type !== expected.recurring.usage_type) {
      catalogFindings.push(`${expected.lookupKey}:usage_type_not_licensed`);
    }
    if (actual.metadata?.wireline_plan_id !== expected.metadata?.wireline_plan_id) {
      catalogFindings.push(`${expected.lookupKey}:plan_id_mismatch`);
    }
    // Checkout refuses a price from any other catalog generation, even when
    // its amount and plan id happen to match. Launch status must exercise that
    // same acceptance contract or it can report GO while every checkout 503s.
    if (actual.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) {
      catalogFindings.push(`${expected.lookupKey}:catalog_version_mismatch`);
    }
    if (actual.metadata?.wireline_price_key !== expected.key) {
      catalogFindings.push(`${expected.lookupKey}:price_key_mismatch`);
    }
    if (!expected.envTarget || String(process.env[expected.envTarget] || "").trim() !== actual.id) {
      catalogFindings.push(`${expected.lookupKey}:runtime_env_price_id_mismatch`);
    }
    const expectedProduct = productByKey.get(expected.productKey);
    const actualProduct =
      actual.product && typeof actual.product === "object" ? actual.product : null;
    if (!expectedProduct || !actualProduct) {
      catalogFindings.push(`${expected.lookupKey}:product_not_expanded`);
    } else {
      if (actualProduct.active !== true) {
        catalogFindings.push(`${expected.lookupKey}:product_inactive`);
      }
      if (actualProduct.livemode !== true) {
        catalogFindings.push(`${expected.lookupKey}:product_not_livemode`);
      }
      if (actualProduct.name !== expectedProduct.name) {
        catalogFindings.push(`${expected.lookupKey}:product_name_mismatch`);
      }
      if (actualProduct.metadata?.wireline_plan_id !== expected.metadata?.wireline_plan_id) {
        catalogFindings.push(`${expected.lookupKey}:product_plan_id_mismatch`);
      }
      if (actualProduct.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) {
        catalogFindings.push(`${expected.lookupKey}:product_catalog_version_mismatch`);
      }
    }
  }
  const starterAnnualExpected = publicCatalogPrices.find(
    (price) => price.lookupKey === "starter_annual_founder_2026_07_v6",
  );
  const starterAnnualActual = liveCatalogPrices.find(
    (price) => price?.lookup_key === starterAnnualExpected?.lookupKey,
  );

  const publicName = String(accountResult.body?.business_profile?.name || "").trim();
  const statementDescriptor = String(
    accountResult.body?.settings?.payments?.statement_descriptor || "",
  )
    .trim()
    .toUpperCase();
  const cardStatementDescriptor = String(
    accountResult.body?.settings?.card_payments?.statement_descriptor_prefix || "",
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
  const supportUrl = String(accountResult.body?.business_profile?.support_url || "")
    .trim()
    .replace(/\/+$/, "");
  const supportEmail = String(accountResult.body?.business_profile?.support_email || "")
    .trim()
    .toLowerCase();
  const brandingLogo = String(accountResult.body?.settings?.branding?.logo || "").trim();
  const brandingIcon = String(accountResult.body?.settings?.branding?.icon || "").trim();
  const brandingPrimaryColor = String(
    accountResult.body?.settings?.branding?.primary_color || "",
  ).toUpperCase();
  const brandingSecondaryColor = String(
    accountResult.body?.settings?.branding?.secondary_color || "",
  ).toUpperCase();
  const brandReady =
    publicName === STRIPE_PUBLIC_BRAND &&
    statementDescriptor === "WIRELINE" &&
    cardStatementDescriptor === "WIRELINE" &&
    websiteOrigin === "https://trywireline.com" &&
    supportOrigin === "https://trywireline.com" &&
    supportUrl === STRIPE_PUBLIC_SUPPORT_URL &&
    supportEmail === STRIPE_PUBLIC_SUPPORT_EMAIL &&
    brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR &&
    brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR;

  const portalConfigurations = Array.isArray(portalResult.body?.data) ? portalResult.body.data : [];
  // Launch certification is stricter than "some active portal exists". The app
  // intentionally creates a Wireline-managed, catalog-versioned configuration;
  // a stale Dashboard default can omit plan switches or cancel immediately.
  const expectedCancellationReasons = new Set([
    "too_expensive",
    "missing_features",
    "switched_service",
    "unused",
    "other",
  ]);
  const portalHasCustomerControls = (configuration) => {
    const features = configuration?.features;
    const customerUpdates = new Set(features?.customer_update?.allowed_updates || []);
    const subscriptionUpdates = new Set(
      features?.subscription_update?.default_allowed_updates || [],
    );
    const cancellationReasons = new Set(
      features?.subscription_cancel?.cancellation_reason?.options || [],
    );
    return (
      configuration?.livemode === true &&
      features?.customer_update?.enabled === true &&
      customerUpdates.size === 2 &&
      customerUpdates.has("email") &&
      customerUpdates.has("address") &&
      features?.payment_method_update?.enabled === true &&
      features?.invoice_history?.enabled === true &&
      features?.subscription_cancel?.enabled === true &&
      features?.subscription_cancel?.mode === "at_period_end" &&
      features?.subscription_cancel?.proration_behavior === "none" &&
      features?.subscription_cancel?.cancellation_reason?.enabled === true &&
      cancellationReasons.size === expectedCancellationReasons.size &&
      [...expectedCancellationReasons].every((reason) => cancellationReasons.has(reason)) &&
      features?.subscription_update?.enabled === true &&
      features?.subscription_update?.proration_behavior === "create_prorations" &&
      subscriptionUpdates.size === 1 &&
      subscriptionUpdates.has("price")
    );
  };
  const activeManagedPortalConfigurations = portalConfigurations.filter(
    (configuration) =>
      configuration?.active === true && configuration?.metadata?.wireline_managed === "true",
  );
  const managedPortalConfigurations = activeManagedPortalConfigurations.filter(
    (configuration) =>
      configuration?.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION,
  );
  const portalConfiguration =
    activeManagedPortalConfigurations.length === 1 && managedPortalConfigurations.length === 1
      ? managedPortalConfigurations[0]
      : null;
  const portalFeatures = portalConfiguration?.features ?? {};
  const portalFindings = [];
  if (portalResult.body?.has_more === true) portalFindings.push("portal_audit_truncated");
  if (managedPortalConfigurations.length === 0) {
    portalFindings.push("managed_configuration_missing");
  } else if (managedPortalConfigurations.length > 1) {
    portalFindings.push("multiple_managed_configurations");
  }
  if (activeManagedPortalConfigurations.length > managedPortalConfigurations.length) {
    portalFindings.push("stale_managed_configuration_active");
  }
  if (portalConfiguration && !portalHasCustomerControls(portalConfiguration)) {
    portalFindings.push("customer_controls_incomplete");
  }
  if (
    portalConfiguration &&
    portalConfiguration.default_return_url !== "https://trywireline.com/settings/billing"
  ) {
    portalFindings.push("return_url_mismatch");
  }
  if (
    portalConfiguration &&
    (portalConfiguration.business_profile?.headline !==
      "Manage your Wireline billing, invoices, and subscription." ||
      portalConfiguration.business_profile?.privacy_policy_url !==
        "https://trywireline.com/privacy" ||
      portalConfiguration.business_profile?.terms_of_service_url !==
        "https://trywireline.com/terms")
  ) {
    portalFindings.push("legal_urls_mismatch");
  }

  const expectedPortalPrices = new Map();
  for (const price of liveCatalogPrices) {
    const productId = price?.product && typeof price.product === "object" ? price.product.id : null;
    if (!productId || !price?.id) continue;
    const ids = expectedPortalPrices.get(productId) || [];
    ids.push(price.id);
    expectedPortalPrices.set(productId, ids);
  }
  const returnedPortalProducts = portalFeatures.subscription_update?.products;
  const actualPortalPrices = new Map();
  for (const product of Array.isArray(returnedPortalProducts) ? returnedPortalProducts : []) {
    if (typeof product?.product !== "string" || !Array.isArray(product?.prices)) continue;
    actualPortalPrices.set(product.product, [...product.prices].sort());
  }
  if (expectedPortalPrices.size !== PUBLIC_SELF_SERVE_PLAN_IDS.length) {
    portalFindings.push("expected_catalog_products_unresolved");
  } else {
    const expectedFingerprintInput = [...expectedPortalPrices.entries()]
      .map(([productId, priceIds]) => `${productId}:${[...new Set(priceIds)].sort().join(",")}`)
      .sort()
      .join("|");
    const expectedFingerprint = createHash("sha256")
      .update(expectedFingerprintInput)
      .digest("hex")
      .slice(0, 32);
    if (portalConfiguration?.metadata?.wireline_portal_products_fp !== expectedFingerprint) {
      portalFindings.push("products_fingerprint_mismatch");
    }
    if (Array.isArray(returnedPortalProducts)) {
      for (const [productId, priceIds] of expectedPortalPrices) {
        const actualIds = actualPortalPrices.get(productId) || [];
        if (actualIds.join(",") !== [...priceIds].sort().join(",")) {
          portalFindings.push(`plan_switch_prices_mismatch:${productId}`);
        }
      }
      for (const productId of actualPortalPrices.keys()) {
        if (!expectedPortalPrices.has(productId)) {
          portalFindings.push(`unexpected_plan_switch_product:${productId}`);
        }
      }
    } else {
      const attestedAt = Number(portalConfiguration?.metadata?.wireline_portal_catalog_attested_at);
      const updatedAt = Number(portalConfiguration?.updated);
      if (
        !Number.isInteger(attestedAt) ||
        !Number.isInteger(updatedAt) ||
        Math.abs(updatedAt - attestedAt) > 5
      ) {
        portalFindings.push("plan_switch_catalog_unverifiable");
      }
    }
  }
  const portalReady = Boolean(
    portalResult.ok && portalConfiguration && portalFindings.length === 0,
  );

  // Read off the code that handles them, exactly as the aligner does. A second
  // hardcoded copy here drifted once the dispute-funds handlers landed and
  // reported a correct endpoint as carrying two extra events.
  const expectedWebhookEvents = getHandledStripeWebhookEvents();
  const webhookEndpoints = Array.isArray(webhookResult.body?.data) ? webhookResult.body.data : [];
  const canonicalWebhooks = webhookEndpoints.filter(
    (endpoint) =>
      endpoint?.status === "enabled" &&
      String(endpoint?.url || "").replace(/\/+$/, "") ===
        "https://trywireline.com/api/stripe-webhook",
  );
  const webhook = canonicalWebhooks.length === 1 ? canonicalWebhooks[0] : null;
  const enabledWebhookEvents = Array.isArray(webhook?.enabled_events)
    ? [...webhook.enabled_events].sort()
    : [];
  const missingWebhookEvents = expectedWebhookEvents.filter(
    (event) => !enabledWebhookEvents.includes(event),
  );
  const extraWebhookEvents = enabledWebhookEvents.filter(
    (event) => event !== "*" && !expectedWebhookEvents.includes(event),
  );
  const webhookFindings = [];
  if (!webhookResult.ok) webhookFindings.push("webhook_inventory_unreachable");
  if (webhookResult.body?.has_more === true) webhookFindings.push("webhook_inventory_truncated");
  if (canonicalWebhooks.length !== 1) {
    webhookFindings.push(`canonical_endpoint_count_${canonicalWebhooks.length}`);
  }
  if (webhook && webhook.livemode !== true) webhookFindings.push("endpoint_not_livemode");
  if (webhook && webhook.api_version !== PINNED_STRIPE_API_VERSION) {
    webhookFindings.push("endpoint_api_version_mismatch");
  }
  if (missingWebhookEvents.length > 0) webhookFindings.push("handled_events_missing");
  if (extraWebhookEvents.length > 0) webhookFindings.push("unhandled_events_enabled");
  const webhookReady = Boolean(webhook && webhookFindings.length === 0);
  const automaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
  const activeTaxRegistrations = Array.isArray(taxRegistrationsResult.body?.data)
    ? taxRegistrationsResult.body.data.filter((registration) => registration?.status === "active")
    : [];
  const taxProviderReady = Boolean(
    taxResult.ok &&
    taxResult.body?.status === "active" &&
    taxRegistrationsResult.ok &&
    activeTaxRegistrations.length > 0,
  );
  const taxReady = !automaticTaxEnabled || taxProviderReady;

  return {
    status:
      balanceResult.ok &&
      catalogPriceResult.ok &&
      accountResult.ok &&
      portalResult.ok &&
      webhookResult.ok &&
      (!automaticTaxEnabled || (taxResult.ok && taxRegistrationsResult.ok))
        ? "reachable"
        : "blocked",
    available_usd: typeof available === "number" ? available / 100 : null,
    pending_usd: typeof pending === "number" ? pending / 100 : null,
    starter_annual: {
      price_id: starterAnnualActual?.id ?? null,
      unit_amount_usd:
        typeof starterAnnualActual?.unit_amount === "number"
          ? starterAnnualActual.unit_amount / 100
          : null,
      active: starterAnnualActual?.active === true,
      livemode: starterAnnualActual?.livemode === true,
      lookup_key: starterAnnualActual?.lookup_key ?? null,
    },
    public_catalog: {
      plan_ids: [...PUBLIC_SELF_SERVE_PLAN_IDS],
      expected_price_count: publicCatalogPrices.length,
      live_price_count: liveCatalogPrices.length,
      findings: catalogFindings,
      ready:
        catalogPriceResult.ok &&
        publicCatalogPrices.length === PUBLIC_SELF_SERVE_PLAN_IDS.length * 2 &&
        liveCatalogPrices.length === publicCatalogPrices.length &&
        catalogFindings.length === 0,
    },
    brand: {
      public_name: publicName || null,
      statement_descriptor_ready: hasWirelineDescriptor(statementDescriptor),
      card_statement_descriptor_ready: hasWirelineDescriptor(cardStatementDescriptor),
      website_origin: websiteOrigin,
      support_origin: supportOrigin,
      support_email: supportEmail || null,
      logo_present: brandingLogo.length > 0,
      icon_present: brandingIcon.length > 0,
      brand_color_ready: brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR,
      accent_color_ready: brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR,
      ready: brandReady,
    },
    customer_portal: {
      managed_or_default_present: Boolean(portalConfiguration),
      payment_method_update: portalFeatures.payment_method_update?.enabled === true,
      invoice_history: portalFeatures.invoice_history?.enabled === true,
      subscription_cancel: portalFeatures.subscription_cancel?.enabled === true,
      subscription_update: portalFeatures.subscription_update?.enabled === true,
      findings: portalFindings,
      ready: portalReady,
    },
    webhook: {
      endpoint_present: Boolean(webhook),
      canonical_endpoint_count: canonicalWebhooks.length,
      livemode: webhook?.livemode === true,
      api_version: webhook?.api_version ?? null,
      expected_api_version: PINNED_STRIPE_API_VERSION,
      missing_events: missingWebhookEvents,
      extra_events: extraWebhookEvents,
      findings: webhookFindings,
      ready: webhookReady,
    },
    tax: {
      automatic_tax_enabled: automaticTaxEnabled,
      status: taxResult.body?.status ?? null,
      active_registration_count: taxRegistrationsResult.ok ? activeTaxRegistrations.length : null,
      provider_ready: taxProviderReady,
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
          callback_method: trigger.callback_method,
        }))
      : [],
  };
}

async function vercelStatus() {
  const token = resolveVercelToken();
  const configuredTeamId = process.env.VERCEL_TEAM_ID?.trim();
  const configuredProjectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token) {
    return { status: "unknown", reason: "Vercel read credentials not supplied" };
  }
  if (
    (configuredTeamId && configuredTeamId !== CANONICAL_TEAM_ID) ||
    (configuredProjectId && configuredProjectId !== CANONICAL_PROJECT_ID)
  ) {
    return { status: "blocked", reason: "Ambient Vercel project identity is not canonical" };
  }
  const teamId = CANONICAL_TEAM_ID;
  const projectId = CANONICAL_PROJECT_ID;
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
  const secretKeyPattern =
    /(?:^|_)(?:SECRET(?:_KEY)?|TOKEN|PASSWORD|PRIVATE(?:_KEY)?|API_KEY|CLIENT_SECRET|DATA_KEY|ENCRYPTION_KEY|DATABASE_URL|POSTGRES_URL)(?:$|_)/i;
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
const [readiness, canonicalRuntime, stripe, database, twilio, vercel] = await Promise.all([
  launchReadiness(),
  canonicalRuntimeStatus(sourceCommit),
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
// could not run. Reading an unreachable Twilio API as "balance below $150" and
// "usage triggers missing" sent an operator to top up an account and recreate
// alerts that were both already fine.
if (twilio.status !== "reachable") {
  blockers.push("twilio_unreachable");
} else {
  if (typeof twilio.prepaid_balance_usd !== "number" || twilio.prepaid_balance_usd < 150) {
    blockers.push("twilio_prepaid_balance_below_150");
  }
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
// An unreadable Vercel API leaves production_commit undefined, which is never
// equal to the source commit — so "the deployed commit is behind" was the
// reported cause of every Vercel outage or rotated read token.
if (vercel.status !== "ready") {
  blockers.push("vercel_unreachable");
} else if (vercel.production_commit !== sourceCommit) {
  blockers.push("production_commit_mismatch");
}
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
  live_checks: { readiness, canonical_runtime: canonicalRuntime, stripe, database, twilio },
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
