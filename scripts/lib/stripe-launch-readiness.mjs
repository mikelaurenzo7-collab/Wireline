import { createHash } from "node:crypto";
import { getHandledStripeWebhookEvents } from "./stripe-handled-events.mjs";
import {
  evaluateStripeWebhookReadiness,
  getPinnedStripeApiVersion,
} from "./stripe-webhook-readiness.mjs";
import {
  STRIPE_BRAND_PRIMARY_COLOR,
  STRIPE_BRAND_SECONDARY_COLOR,
  STRIPE_PUBLIC_BRAND,
  STRIPE_PUBLIC_SUPPORT_EMAIL,
  STRIPE_PUBLIC_SUPPORT_URL,
  effectiveStripeCardStatementDescriptor,
  hasWirelineDescriptor,
} from "./stripe-account-identity.mjs";
import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
  PUBLIC_SELF_SERVE_PLAN_IDS,
} from "./stripe-founder-catalog.mjs";
const PINNED_STRIPE_API_VERSION = getPinnedStripeApiVersion();

export async function readStripeLaunchStatus({ env, jsonFetch, canonicalOrigin }) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { status: "unknown", reason: "STRIPE_SECRET_KEY not supplied" };
  const headers = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": PINNED_STRIPE_API_VERSION,
  };
  const publicPlanIds = new Set(PUBLIC_SELF_SERVE_PLAN_IDS);
  const eligibleCatalogPrices = FOUNDER_PRICES.filter(
    (price) => price.recurring && publicPlanIds.has(price.metadata?.wireline_plan_id),
  );
  // Each interval is an explicit runtime opt-in. An absent Email price is a
  // deliberate capacity hold, not an incorrectly configured Calls launch.
  const publicCatalogPrices = eligibleCatalogPrices.filter(
    (price) => price.envTarget && String(env[price.envTarget] || "").trim(),
  );
  const deferredCatalogPrices = eligibleCatalogPrices.filter(
    (price) => !publicCatalogPrices.includes(price),
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
    publicCatalogPrices.length
      ? jsonFetch(`https://api.stripe.com/v1/prices?${catalogParams.toString()}`, { headers })
      : Promise.resolve({ ok: true, body: { data: [], has_more: false } }),
    jsonFetch("https://api.stripe.com/v1/account", { headers }),
    // Stripe omits the allowed plan-switch catalog unless it is expanded.
    // Match the dedicated portal verifier so a valid live catalog can be audited.
    jsonFetch(
      "https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100&expand[]=data.features.subscription_update.products",
      { headers },
    ),
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
  if (publicCatalogPrices.length === 0) catalogFindings.push("no_configured_new_sale_prices");
  if (catalogPriceResult.body?.has_more === true) catalogFindings.push("price_audit_truncated");
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
    if (actual.type !== "recurring") {
      catalogFindings.push(`${expected.lookupKey}:type_not_recurring`);
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
    if (!expected.envTarget || String(env[expected.envTarget] || "").trim() !== actual.id) {
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
    // Match the checkout contract on both objects. Correct price/version alone
    // cannot certify a stale resource or usage allowance that checkout rejects.
    for (const [owner, metadata] of [
      ["price", actual.metadata],
      ["product", actualProduct?.metadata],
    ]) {
      if (metadata?.wireline_channels !== expected.metadata.wireline_channels) {
        catalogFindings.push(`${expected.lookupKey}:${owner}_channels_mismatch`);
      }
      for (const field of [
        "included_agents",
        "included_numbers",
        "included_mailboxes",
        "included_voice_minutes",
        "included_ai_spend_usd",
      ]) {
        if (Number(metadata?.[field]) !== Number(expected.metadata[field])) {
          catalogFindings.push(`${expected.lookupKey}:${owner}_${field}_mismatch`);
        }
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
  const cardStatementDescriptor = effectiveStripeCardStatementDescriptor(accountResult.body);
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
    hasWirelineDescriptor(statementDescriptor) &&
    hasWirelineDescriptor(cardStatementDescriptor.value) &&
    websiteOrigin === canonicalOrigin &&
    supportOrigin === canonicalOrigin &&
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
      features?.subscription_update?.enabled === false
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
  const portalFeatures = portalConfiguration?.features || {};
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
    portalConfiguration.default_return_url !== `${canonicalOrigin}/settings/billing`
  ) {
    portalFindings.push("return_url_mismatch");
  }
  if (
    portalConfiguration &&
    (portalConfiguration.business_profile?.headline !==
      "Manage your BotBound billing, invoices, and subscription." ||
      portalConfiguration.business_profile?.privacy_policy_url !== `${canonicalOrigin}/privacy` ||
      portalConfiguration.business_profile?.terms_of_service_url !== `${canonicalOrigin}/terms`)
  ) {
    portalFindings.push("legal_urls_mismatch");
  }

  // No channel-switching catalog is exposed during this rollout. Verify the
  // empty fingerprint plus explicit disabled updates; payment/cancel remain live.
  const expectedFingerprint = createHash("sha256").update("").digest("hex").slice(0, 32);
  if (portalConfiguration?.metadata?.wireline_portal_products_fp !== expectedFingerprint) {
    portalFindings.push("products_fingerprint_mismatch");
  }
  const portalReady = Boolean(
    portalResult.ok && portalConfiguration && portalFindings.length === 0,
  );

  // Read off the code that handles them, exactly as the aligner does. A second
  // hardcoded copy here drifted once the dispute-funds handlers landed and
  // reported a correct endpoint as carrying two extra events.
  const expectedWebhookEvents = getHandledStripeWebhookEvents();
  const webhookReadiness = evaluateStripeWebhookReadiness(
    webhookResult,
    expectedWebhookEvents,
    PINNED_STRIPE_API_VERSION,
  );
  const webhook = webhookReadiness.endpoint;
  const missingWebhookEvents = webhookReadiness.missingEvents;
  const extraWebhookEvents = webhookReadiness.extraEvents;
  const webhookFindings = webhookReadiness.findings;
  const webhookReady = webhookReadiness.ready;
  const automaticTaxEnabled = env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
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
      plan_ids: [...new Set(publicCatalogPrices.map((price) => price.metadata.wireline_plan_id))],
      deferred_plan_ids: PUBLIC_SELF_SERVE_PLAN_IDS.filter(
        (id) => !publicCatalogPrices.some((price) => price.metadata.wireline_plan_id === id),
      ),
      deferred_intervals: deferredCatalogPrices.map((price) => ({
        plan_id: price.metadata.wireline_plan_id,
        interval: price.recurring.interval,
        env_key: price.envTarget,
        reason: "runtime_price_not_configured",
      })),
      expected_price_count: publicCatalogPrices.length,
      live_price_count: liveCatalogPrices.length,
      findings: catalogFindings,
      ready:
        catalogPriceResult.ok &&
        publicCatalogPrices.length > 0 &&
        liveCatalogPrices.length === publicCatalogPrices.length &&
        catalogFindings.length === 0,
    },
    brand: {
      public_name: publicName || null,
      statement_descriptor_ready: hasWirelineDescriptor(statementDescriptor),
      card_statement_descriptor_ready: hasWirelineDescriptor(cardStatementDescriptor.value),
      card_statement_descriptor_effective: cardStatementDescriptor.value || null,
      card_statement_descriptor_source: cardStatementDescriptor.source,
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
      canonical_endpoint_count: webhookReadiness.canonicalEndpointCount,
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
