#!/usr/bin/env node

import Stripe from "stripe";
import { PROJECT_ID as CANONICAL_VERCEL_PROJECT_ID } from "./lib/vercel-project.mjs";

import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
  PUBLIC_SELF_SERVE_PLAN_IDS,
} from "./lib/stripe-founder-catalog.mjs";
import {
  managedPortalConfigurationFindings,
  managedPortalConfigurationIdempotencyKey,
  managedPortalConfigurationParams,
  portalProductsFingerprint,
  type PortalProduct,
} from "../src/lib/stripe-portal-policy";
import { STRIPE_API_VERSION } from "../src/lib/stripe-api-version";
import { planById } from "../src/lib/plan-catalog";
import { stripePriceMatchesFounderPlan } from "../src/lib/stripe-founder-price-contract";

const APPLY_FLAG = "--apply";
const apply = process.argv.includes(APPLY_FLAG);
const environment = String(process.env.VERCEL_ENV || process.env.NODE_ENV || "").trim();
const appUrl = String(process.env.APP_URL || "")
  .trim()
  .replace(/\/+$/, "");
const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();

if (environment !== "production") {
  throw new Error("Stripe portal reconciliation is allowed only in Vercel Production.");
}
if (process.env.VERCEL_PROJECT_ID !== CANONICAL_VERCEL_PROJECT_ID) {
  throw new Error("Stripe portal reconciliation is pinned to the canonical Wireline project.");
}
if (appUrl !== "https://trywireline.com") {
  throw new Error("Stripe portal reconciliation requires APP_URL=https://trywireline.com.");
}
if (!/^(?:sk|rk)_live_/.test(secretKey)) {
  throw new Error("Stripe portal reconciliation requires the live Production Stripe key.");
}

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true });
const publicPlans = new Set(PUBLIC_SELF_SERVE_PLAN_IDS);
const expectedPrices = FOUNDER_PRICES.filter(
  (price) => price.recurring && publicPlans.has(price.metadata?.wireline_plan_id),
);
const productByKey = new Map(FOUNDER_PRODUCTS.map((product) => [product.key, product]));
const lookupKeys = expectedPrices.map((price) => price.lookupKey).filter(Boolean) as string[];

if (expectedPrices.length !== PUBLIC_SELF_SERVE_PLAN_IDS.length * 2 || lookupKeys.length !== 6) {
  throw new Error(
    "Canonical public Stripe catalog does not resolve to three monthly/annual plans.",
  );
}

const livePrices = await stripe.prices.list({
  active: true,
  lookup_keys: lookupKeys,
  expand: ["data.product"],
  limit: 100,
});
if (livePrices.has_more || livePrices.data.length !== expectedPrices.length) {
  throw new Error(
    `Expected exactly ${expectedPrices.length} active public Stripe prices; found ${livePrices.data.length}.`,
  );
}

const products = new Map<string, string[]>();
for (const expected of expectedPrices) {
  const matches = livePrices.data.filter((price) => price.lookup_key === expected.lookupKey);
  if (matches.length !== 1) {
    throw new Error(`${expected.lookupKey} must resolve to exactly one active Stripe price.`);
  }
  const [price] = matches;
  const product =
    typeof price.product === "string" || "deleted" in price.product ? null : price.product;
  const expectedProduct = productByKey.get(expected.productKey);
  const plan = planById(expected.metadata?.wireline_plan_id);
  const configuredPriceId = expected.envTarget
    ? String(process.env[expected.envTarget] || "").trim()
    : "";
  if (
    !expectedProduct ||
    !plan ||
    !product ||
    !stripePriceMatchesFounderPlan(price, plan, expected.recurring.interval) ||
    price.metadata?.wireline_price_key !== expected.key ||
    product.active !== true ||
    product.name !== expectedProduct.name ||
    product.metadata?.wireline_plan_id !== expected.metadata?.wireline_plan_id ||
    product.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION ||
    configuredPriceId !== price.id
  ) {
    throw new Error(`${expected.lookupKey} failed the canonical live catalog contract.`);
  }
  const ids = products.get(product.id) || [];
  ids.push(price.id);
  products.set(product.id, ids);
}

const portalProducts: PortalProduct[] = [...products.entries()].map(([product, prices]) => ({
  product,
  prices,
}));
if (portalProducts.length !== PUBLIC_SELF_SERVE_PLAN_IDS.length) {
  throw new Error(`Expected three public portal products; found ${portalProducts.length}.`);
}

const fingerprint = portalProductsFingerprint(portalProducts);
const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
if (configurations.has_more) {
  throw new Error("Stripe has more than 100 active portal configurations; refusing partial audit.");
}
let configuration = configurations.data.find(
  (candidate) =>
    candidate.metadata?.wireline_managed === "true" &&
    candidate.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION &&
    candidate.metadata?.wireline_portal_products_fp === fingerprint,
);

if (!configuration && !apply) {
  throw new Error("The canonical managed Stripe customer portal configuration is missing.");
}

if (!configuration) {
  configuration = await stripe.billingPortal.configurations.create(
    managedPortalConfigurationParams(appUrl, portalProducts),
    { idempotencyKey: managedPortalConfigurationIdempotencyKey(portalProducts) },
  );
} else {
  const beforeFindings = managedPortalConfigurationFindings(configuration, appUrl, portalProducts);
  if (beforeFindings.length > 0) {
    if (!apply) {
      throw new Error(`Managed Stripe portal drift: ${beforeFindings.join(", ")}.`);
    }
    configuration = await stripe.billingPortal.configurations.update(
      configuration.id,
      managedPortalConfigurationParams(appUrl, portalProducts),
    );
  }
}

const verified = await stripe.billingPortal.configurations.retrieve(configuration.id);
const findings = managedPortalConfigurationFindings(verified, appUrl, portalProducts);
if (findings.length > 0) {
  throw new Error(`Managed Stripe portal verification failed: ${findings.join(", ")}.`);
}

const staleManaged = configurations.data.filter(
  (candidate) => candidate.id !== verified.id && candidate.metadata?.wireline_managed === "true",
);
if (staleManaged.length > 0 && !apply) {
  throw new Error(
    `${staleManaged.length} stale managed Stripe portal configuration(s) are active.`,
  );
}
if (apply) {
  await Promise.all(
    staleManaged.map((candidate) =>
      stripe.billingPortal.configurations.update(candidate.id, { active: false }),
    ),
  );
}

const activeConfigurations = await stripe.billingPortal.configurations.list({
  active: true,
  limit: 100,
});
if (activeConfigurations.has_more) {
  throw new Error("Stripe has more than 100 active portal configurations after reconciliation.");
}
const activeManaged = activeConfigurations.data.filter(
  (candidate) => candidate.metadata?.wireline_managed === "true",
);
if (activeManaged.length !== 1 || activeManaged[0]?.id !== verified.id) {
  throw new Error("Stripe must have exactly one active Wireline-managed portal configuration.");
}

console.log(
  `Stripe customer portal ready: ${verified.id} (${portalProducts.length} public plans, fingerprint ${fingerprint}).`,
);
