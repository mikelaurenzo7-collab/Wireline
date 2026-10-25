#!/usr/bin/env node
/**
 * Usage billing Stripe setup. DRY RUN BY DEFAULT: prints every product, meter
 * and price it would create and the env vars to set, and calls nothing.
 *
 * Nothing here runs until Michael approves the rates. Then:
 *   node scripts/stripe-usage-billing-setup.mjs                    # dry run (default)
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-usage-billing-setup.mjs --apply
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-usage-billing-setup.mjs --apply --live --rates-approved
 *
 * --apply with a live key is refused unless both --live and --rates-approved are
 * passed. The script never modifies or archives an existing object: when a
 * lookup key or meter event name already exists it reuses that object and
 * reports it. It never writes env vars; it prints them for the operator.
 *
 * Rates mirror src/lib/usage-billing-catalog.ts (catalog 2026-10-usage-v1).
 * The included units are a $0 first tier on each graduated metered price, so
 * Stripe and the in-app estimator price a period total identically.
 */
import Stripe from "stripe";

export const CATALOG_VERSION = "2026-10-usage-v1";
export const BOTBOUND_STRIPE_ACCOUNT_ID = "acct_1TkyXL8e6If87QKm";

/** Verify the selected account before creating any billing objects. */
export async function assertUsageStripeAccount(stripe) {
  const account = await stripe.accounts.retrieve();
  if (account.id !== BOTBOUND_STRIPE_ACCOUNT_ID) {
    throw new Error(
      `Usage billing setup requires the BotBound Stripe account (${BOTBOUND_STRIPE_ACCOUNT_ID}); the supplied key belongs to another account.`,
    );
  }
}

/** Cents as decimal strings; Stripe graduated tiers apply to the period total. */
export const USAGE_STRIPE_PLAN = {
  product: {
    name: "BotBound",
    description: "As many Bots as you need. Pay only for the work they do.",
    // Plan identity lives on the base price only, so no other item resolves as the plan.
    metadata: { wireline_product: "usage", wireline_catalog_version: CATALOG_VERSION },
  },
  base: {
    lookup_key: "usage_base_monthly_2026_10_v1",
    nickname: "Monthly base",
    unit_amount: 1900,
    // basePlanByStripePrice resolves the subscription plan from this metadata.
    metadata: { wireline_plan_id: "usage", wireline_catalog_version: CATALOG_VERSION },
    env: "STRIPE_USAGE_BASE_PRICE_ID",
  },
  meters: [
    {
      key: "call_minutes",
      display_name: "Call minutes",
      event_name: "botbound_call_minutes",
      lookup_key: "usage_call_minutes_2026_10_v1",
      tiers: [
        { up_to: 60, unit_amount_decimal: "0" },
        { up_to: 560, unit_amount_decimal: "25" },
        { up_to: 2060, unit_amount_decimal: "22" },
        { up_to: "inf", unit_amount_decimal: "20" },
      ],
      priceEnv: "STRIPE_USAGE_CALL_MINUTES_PRICE_ID",
      eventEnv: "STRIPE_USAGE_CALL_MINUTES_METER_EVENT",
    },
    {
      key: "emails_handled",
      display_name: "Emails handled",
      event_name: "botbound_emails_handled",
      lookup_key: "usage_emails_2026_10_v1",
      tiers: [
        { up_to: 100, unit_amount_decimal: "0" },
        { up_to: "inf", unit_amount_decimal: "2" },
      ],
      priceEnv: "STRIPE_USAGE_EMAILS_PRICE_ID",
      eventEnv: "STRIPE_USAGE_EMAILS_METER_EVENT",
    },
    {
      key: "computer_minutes",
      display_name: "Computer minutes",
      event_name: "botbound_computer_minutes",
      lookup_key: "usage_computer_minutes_2026_10_v1",
      tiers: [
        { up_to: 15, unit_amount_decimal: "0" },
        { up_to: "inf", unit_amount_decimal: "15" },
      ],
      priceEnv: "STRIPE_USAGE_COMPUTER_MINUTES_PRICE_ID",
      eventEnv: "STRIPE_USAGE_COMPUTER_MINUTES_METER_EVENT",
    },
  ],
  addons: [
    {
      key: "number",
      nickname: "BotBound number",
      lookup_key: "usage_addon_number_2026_10_v1",
      unit_amount: 300,
      env: "STRIPE_USAGE_NUMBER_ADDON_PRICE_ID",
    },
    {
      key: "email_address",
      nickname: "BotBound email address",
      lookup_key: "usage_addon_email_2026_10_v1",
      unit_amount: 400,
      env: "STRIPE_USAGE_EMAIL_ADDON_PRICE_ID",
    },
  ],
};

export function plannedObjects(plan = USAGE_STRIPE_PLAN) {
  return [
    { kind: "product", name: plan.product.name, metadata: plan.product.metadata },
    {
      kind: "price",
      lookup_key: plan.base.lookup_key,
      unit_amount: plan.base.unit_amount,
      interval: "month",
    },
    ...plan.meters.flatMap((meter) => [
      { kind: "meter", event_name: meter.event_name, aggregation: "sum" },
      {
        kind: "price",
        lookup_key: meter.lookup_key,
        billing_scheme: "tiered",
        tiers_mode: "graduated",
        tiers: meter.tiers,
      },
    ]),
    ...plan.addons.map((addon) => ({
      kind: "price",
      lookup_key: addon.lookup_key,
      unit_amount: addon.unit_amount,
      interval: "month",
      metadata: { wireline_addon_id: `usage_${addon.key}` },
    })),
  ];
}

export function envVarNames(plan = USAGE_STRIPE_PLAN) {
  return [
    "USAGE_BILLING_ENABLED",
    plan.base.env,
    ...plan.meters.flatMap((meter) => [meter.priceEnv, meter.eventEnv]),
    ...plan.addons.map((addon) => addon.env),
  ];
}

/** Refuse anything but a dry run unless the key and flags agree. */
export function applyGuard({ apply, live, ratesApproved, key }) {
  if (!apply) return { mode: "dry-run" };
  if (!key) throw new Error("--apply needs STRIPE_SECRET_KEY in the operator environment.");
  const isLive = /^(?:sk|rk)_live_/.test(key);
  const isTest = /^(?:sk|rk)_test_/.test(key);
  if (!isLive && !isTest) throw new Error("STRIPE_SECRET_KEY is not a Stripe secret key.");
  if (isLive && !(live && ratesApproved)) {
    throw new Error("Live mode needs --live and --rates-approved, after the rates are approved.");
  }
  if (isTest && live) throw new Error("--live was passed with a test key.");
  return { mode: isLive ? "live" : "test" };
}

async function findPrice(stripe, lookupKey) {
  const result = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  return result.data[0] ?? null;
}

async function findMeter(stripe, eventName) {
  for await (const meter of stripe.billing.meters.list({ limit: 100 })) {
    if (meter.event_name === eventName && meter.status === "active") return meter;
  }
  return null;
}

async function apply(stripe, plan) {
  const env = {};
  const created = [];
  const existingBase = await findPrice(stripe, plan.base.lookup_key);
  let productId =
    typeof existingBase?.product === "string" ? existingBase.product : existingBase?.product?.id;
  if (!productId) {
    const product = await stripe.products.create(plan.product, {
      idempotencyKey: `usage-product-${CATALOG_VERSION}`,
    });
    productId = product.id;
    created.push(`product ${product.id}`);
  }
  const base =
    existingBase ??
    (await stripe.prices.create(
      {
        product: productId,
        currency: "usd",
        unit_amount: plan.base.unit_amount,
        recurring: { interval: "month", usage_type: "licensed" },
        lookup_key: plan.base.lookup_key,
        nickname: plan.base.nickname,
        metadata: plan.base.metadata,
        tax_behavior: "exclusive",
      },
      { idempotencyKey: `usage-price-${plan.base.lookup_key}` },
    ));
  if (!existingBase) created.push(`price ${base.id} (${plan.base.lookup_key})`);
  env[plan.base.env] = base.id;

  for (const meterSpec of plan.meters) {
    let meter = await findMeter(stripe, meterSpec.event_name);
    if (!meter) {
      meter = await stripe.billing.meters.create(
        {
          display_name: meterSpec.display_name,
          event_name: meterSpec.event_name,
          default_aggregation: { formula: "sum" },
          customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
          value_settings: { event_payload_key: "value" },
        },
        { idempotencyKey: `usage-meter-${meterSpec.event_name}` },
      );
      created.push(`meter ${meter.id} (${meterSpec.event_name})`);
    }
    let price = await findPrice(stripe, meterSpec.lookup_key);
    if (!price) {
      price = await stripe.prices.create(
        {
          product: productId,
          currency: "usd",
          billing_scheme: "tiered",
          tiers_mode: "graduated",
          tiers: meterSpec.tiers,
          recurring: { interval: "month", usage_type: "metered", meter: meter.id },
          lookup_key: meterSpec.lookup_key,
          nickname: meterSpec.display_name,
          // Metered items never carry wireline_plan_id, so they never resolve as the base plan.
          metadata: {
            wireline_usage_meter: meterSpec.key,
            wireline_catalog_version: CATALOG_VERSION,
          },
          tax_behavior: "exclusive",
        },
        { idempotencyKey: `usage-price-${meterSpec.lookup_key}` },
      );
      created.push(`price ${price.id} (${meterSpec.lookup_key})`);
    }
    env[meterSpec.priceEnv] = price.id;
    env[meterSpec.eventEnv] = meterSpec.event_name;
  }

  for (const addon of plan.addons) {
    let price = await findPrice(stripe, addon.lookup_key);
    if (!price) {
      price = await stripe.prices.create(
        {
          product: productId,
          currency: "usd",
          unit_amount: addon.unit_amount,
          recurring: { interval: "month", usage_type: "licensed" },
          lookup_key: addon.lookup_key,
          nickname: addon.nickname,
          metadata: {
            wireline_addon_id: `usage_${addon.key}`,
            wireline_catalog_version: CATALOG_VERSION,
          },
          tax_behavior: "exclusive",
        },
        { idempotencyKey: `usage-price-${addon.lookup_key}` },
      );
      created.push(`price ${price.id} (${addon.lookup_key})`);
    }
    env[addon.env] = price.id;
  }
  return { env, created };
}

async function main(argv = process.argv.slice(2)) {
  const flags = {
    apply: argv.includes("--apply"),
    live: argv.includes("--live"),
    ratesApproved: argv.includes("--rates-approved"),
    key: process.env.STRIPE_SECRET_KEY?.trim() || "",
  };
  const { mode } = applyGuard(flags);
  if (mode === "dry-run") {
    console.log("DRY RUN. Nothing is created. Objects this script would create (or reuse):");
    for (const object of plannedObjects()) console.log(JSON.stringify(object));
    console.log("\nEnv vars to set after --apply (values are printed by --apply):");
    for (const name of envVarNames()) console.log(`  ${name}`);
    console.log("  USAGE_BILLING_ENABLED stays false until Stage 2.");
    return;
  }
  const stripe = new Stripe(flags.key);
  await assertUsageStripeAccount(stripe);
  const result = await apply(stripe, USAGE_STRIPE_PLAN);
  console.log(`Mode: ${mode}`);
  console.log(
    result.created.length
      ? `Created:\n  ${result.created.join("\n  ")}`
      : "Created nothing; all objects already exist.",
  );
  console.log("\nSet these env vars (ids are not secrets):");
  for (const [name, value] of Object.entries(result.env)) console.log(`  ${name}=${value}`);
  console.log("  USAGE_BILLING_ENABLED=false  # flip to true only at Stage 2");
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
