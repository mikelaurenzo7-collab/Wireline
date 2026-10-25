#!/usr/bin/env node
/**
 * Usage billing Stripe setup. DRY RUN BY DEFAULT: prints every product, meter
 * and price it would create and the env vars to set, and calls nothing.
 *
 * Dry run first; apply only after the authorized offer passes invoice validation:
 *   node scripts/stripe-usage-billing-setup.mjs                    # dry run (default)
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-usage-billing-setup.mjs --apply
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-usage-billing-setup.mjs --apply --live --rates-approved
 *
 * --apply with a live key is refused unless both --live and --rates-approved are
 * passed. The script never modifies or archives an existing object: when a
 * lookup key or meter event name already exists it reuses that object and
 * reports it. It never writes env vars; it prints them for the operator.
 *
 * Rates mirror src/lib/usage-billing-catalog.ts (catalog 2026-10-usage-v2).
 * The shared allowance is a $0 first tier on the single weighted meter, so
 * Stripe and the in-app estimator price a period total identically.
 */
import Stripe from "stripe";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CATALOG_VERSION = "2026-10-usage-v2";
export const BOTBOUND_STRIPE_ACCOUNT_ID = "acct_1TkyXL8e6If87QKm";

/** Verify the selected account before creating any billing objects. */
export async function assertUsageStripeAccount(stripe, { mode = "live", sandboxAccountId } = {}) {
  const account = await stripe.accounts.retrieve();
  const expected =
    mode === "test" && /^acct_[A-Za-z0-9]+$/.test(sandboxAccountId ?? "")
      ? sandboxAccountId
      : BOTBOUND_STRIPE_ACCOUNT_ID;
  if (account.id !== expected) {
    throw new Error(
      `Usage billing setup requires the BotBound Stripe account (${BOTBOUND_STRIPE_ACCOUNT_ID}); the supplied key belongs to another account.`,
    );
  }
}

/** Cents as decimal strings; Stripe graduated tiers apply to the period total. */
export const USAGE_STRIPE_PLAN = {
  product: {
    name: "BotBound",
    description: "Shared work plans for inbound and outbound calls, SMS, email, and Computer.",
    // Plan identity lives on the base price only, so no other item resolves as the plan.
    metadata: { wireline_product: "usage", wireline_catalog_version: CATALOG_VERSION },
  },
  base: {
    lookup_key: "usage_base_monthly_2026_10_v2",
    nickname: "Monthly base",
    unit_amount: 1900,
    // basePlanByStripePrice resolves the subscription plan from this metadata.
    metadata: { wireline_plan_id: "usage", wireline_catalog_version: CATALOG_VERSION },
    env: "STRIPE_USAGE_BASE_PRICE_ID",
  },
  meters: [
    {
      key: "work",
      display_name: "Shared work (100 credits = $1)",
      event_name: "botbound_work_credits_v2",
      lookup_key: "usage_work_2026_10_v2",
      tiers: [
        { up_to: 1200, unit_amount_decimal: "0" },
        { up_to: "inf", unit_amount_decimal: "1" },
      ],
      priceEnv: "STRIPE_USAGE_WORK_PRICE_ID",
      eventEnv: "STRIPE_USAGE_WORK_METER_EVENT",
    },
  ],
  addons: [
    {
      key: "number",
      nickname: "BotBound number",
      lookup_key: "usage_addon_number_2026_10_v2",
      unit_amount: 300,
      env: "STRIPE_USAGE_NUMBER_ADDON_PRICE_ID",
    },
    {
      key: "email_address",
      nickname: "BotBound email address",
      lookup_key: "usage_addon_email_2026_10_v2",
      unit_amount: 400,
      env: "STRIPE_USAGE_EMAIL_ADDON_PRICE_ID",
    },
  ],
};

function bundledPlan(tier, name, monthlyCents, workCents, identities, envPrefix) {
  return {
    ...USAGE_STRIPE_PLAN,
    base: {
      ...USAGE_STRIPE_PLAN.base,
      lookup_key: `usage_${tier}_monthly_2026_10_v1`,
      nickname: `BotBound ${name}: $${workCents / 100} shared work, ${identities} number(s) and email address(es)`,
      unit_amount: monthlyCents,
      metadata: { ...USAGE_STRIPE_PLAN.base.metadata, wireline_usage_tier: tier },
      env: `STRIPE_USAGE_${envPrefix}_BASE_PRICE_ID`,
    },
    meters: [
      {
        ...USAGE_STRIPE_PLAN.meters[0],
        lookup_key: `usage_${tier}_work_2026_10_v1`,
        tiers: [
          { up_to: workCents, unit_amount_decimal: "0" },
          { up_to: "inf", unit_amount_decimal: "1" },
        ],
        priceEnv: `STRIPE_USAGE_${envPrefix}_WORK_PRICE_ID`,
      },
    ],
  };
}

export const USAGE_STRIPE_PLANS = {
  starter: USAGE_STRIPE_PLAN,
  lite: bundledPlan("lite", "Lite", 1200, 400, 1, "LITE"),
  standard: bundledPlan("standard", "Starter", 2400, 1400, 1, "STARTER"),
  plus: bundledPlan("plus", "Plus", 4900, 3600, 2, "PLUS"),
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
  const isTest = /^(?:sk|rk|rkcs)_test_/.test(key);
  if (!isLive && !isTest) throw new Error("STRIPE_SECRET_KEY is not a Stripe secret key.");
  if (isLive && !(live && ratesApproved)) {
    throw new Error("Live mode needs --live and --rates-approved, after the rates are approved.");
  }
  if (isTest && live) throw new Error("--live was passed with a test key.");
  return { mode: isLive ? "live" : "test" };
}

async function findPrice(stripe, lookupKey) {
  const result = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
    expand: ["data.tiers"],
  });
  return result.data[0] ?? null;
}

/** A lookup key is a name, not proof that the object still matches our rate card. */
export function validateUsagePrice(price, spec, { productId, meterId } = {}) {
  const product = typeof price.product === "string" ? price.product : price.product?.id;
  const expectedMetadata =
    spec.metadata ??
    (spec.tiers
      ? { wireline_usage_meter: spec.key, wireline_catalog_version: CATALOG_VERSION }
      : { wireline_addon_id: `usage_${spec.key}`, wireline_catalog_version: CATALOG_VERSION });
  const common =
    price.active === true &&
    price.currency === "usd" &&
    price.type === "recurring" &&
    price.tax_behavior === "exclusive" &&
    price.lookup_key === spec.lookup_key &&
    !price.transform_quantity &&
    price.recurring?.interval === "month" &&
    price.recurring?.interval_count === 1 &&
    (!productId || product === productId) &&
    Object.entries(expectedMetadata).every(([key, value]) => price.metadata?.[key] === value);
  const rates = spec.tiers
    ? price.billing_scheme === "tiered" &&
      price.tiers_mode === "graduated" &&
      price.recurring?.usage_type === "metered" &&
      price.recurring?.meter === meterId &&
      price.tiers?.length === spec.tiers.length &&
      spec.tiers.every((tier, i) => {
        const actual = price.tiers[i];
        return (
          (tier.up_to === "inf" ? actual.up_to == null : actual.up_to === tier.up_to) &&
          Number(actual.unit_amount_decimal ?? actual.unit_amount) ===
            Number(tier.unit_amount_decimal) &&
          Number(actual.flat_amount_decimal ?? actual.flat_amount ?? 0) === 0
        );
      })
    : price.billing_scheme === "per_unit" &&
      price.recurring?.usage_type === "licensed" &&
      !price.recurring?.meter &&
      Number(price.unit_amount_decimal ?? price.unit_amount) === spec.unit_amount;
  if (!common || !rates)
    throw new Error(
      `Usage price ${spec.lookup_key} does not match the approved catalog. No automatic repair is allowed.`,
    );
}

export function validateUsageMeter(meter, spec) {
  if (
    meter.status !== "active" ||
    meter.event_name !== spec.event_name ||
    meter.default_aggregation?.formula !== "sum" ||
    meter.customer_mapping?.type !== "by_id" ||
    meter.customer_mapping?.event_payload_key !== "stripe_customer_id" ||
    meter.value_settings?.event_payload_key !== "value" ||
    meter.event_time_window != null
  )
    throw new Error(
      `Usage meter ${spec.event_name} has incompatible aggregation or payload settings.`,
    );
}

async function findMeter(stripe, eventName) {
  for await (const meter of stripe.billing.meters.list({ limit: 100 })) {
    if (meter.event_name === eventName && meter.status === "active") return meter;
  }
  return null;
}

export async function applyUsageCatalog(stripe, plan = USAGE_STRIPE_PLAN) {
  const env = {};
  const created = [];
  const existingBase = await findPrice(stripe, plan.base.lookup_key);
  if (existingBase) validateUsagePrice(existingBase, plan.base);
  let productId =
    typeof existingBase?.product === "string" ? existingBase.product : existingBase?.product?.id;
  if (!productId && plan !== USAGE_STRIPE_PLAN) {
    const starter = await findPrice(stripe, USAGE_STRIPE_PLAN.base.lookup_key);
    if (!starter) throw new Error("Create the original usage catalog before bundled plans.");
    validateUsagePrice(starter, USAGE_STRIPE_PLAN.base);
    productId = typeof starter.product === "string" ? starter.product : starter.product?.id;
  }
  if (!productId) {
    const product = await stripe.products.create(plan.product, {
      idempotencyKey: `usage-product-${CATALOG_VERSION}`,
    });
    productId = product.id;
    created.push(`product ${product.id}`);
  } else {
    const product = await stripe.products.retrieve(productId);
    if (product.deleted || !product.active || product.metadata?.wireline_product !== "usage")
      throw new Error("The existing usage product is inactive or belongs to another catalog.");
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
    validateUsageMeter(meter, meterSpec);
    let price = await findPrice(stripe, meterSpec.lookup_key);
    if (price) validateUsagePrice(price, meterSpec, { productId, meterId: meter.id });
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
    if (price) validateUsagePrice(price, addon, { productId });
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
  const tier = argv.find((arg) => arg.startsWith("--tier="))?.slice(7) ?? "starter";
  if (!Object.hasOwn(USAGE_STRIPE_PLANS, tier)) throw new Error("Unknown usage tier.");
  const plan = USAGE_STRIPE_PLANS[tier];
  const flags = {
    apply: argv.includes("--apply"),
    live: argv.includes("--live"),
    ratesApproved: argv.includes("--rates-approved"),
    key: process.env.STRIPE_SECRET_KEY?.trim() || "",
  };
  const { mode } = applyGuard(flags);
  if (mode === "dry-run") {
    console.log("DRY RUN. Nothing is created. Objects this script would create (or reuse):");
    for (const object of plannedObjects(plan)) console.log(JSON.stringify(object));
    console.log("\nEnv vars to set after --apply (values are printed by --apply):");
    for (const name of envVarNames(plan)) console.log(`  ${name}`);
    console.log("  USAGE_BILLING_ENABLED stays false until Stage 2.");
    return;
  }
  const stripe = new Stripe(flags.key);
  await assertUsageStripeAccount(stripe, {
    mode,
    sandboxAccountId: process.env.STRIPE_USAGE_SANDBOX_ACCOUNT_ID,
  });
  const result = await applyUsageCatalog(stripe, plan);
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

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
