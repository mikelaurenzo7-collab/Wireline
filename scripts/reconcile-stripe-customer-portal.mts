#!/usr/bin/env node

import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { assertStripePortalOperatorEnvironment } from "./lib/stripe-operator-policy.mts";
import { getDeploymentIdentity } from "../src/lib/deployment-environment";

import { FOUNDER_CATALOG_VERSION } from "./lib/stripe-founder-catalog.mjs";
import {
  managedPortalConfigurationFindings,
  managedPortalConfigurationIdempotencyKey,
  managedPortalConfigurationParams,
  portalProductsFingerprint,
  type PortalProduct,
} from "../src/lib/stripe-portal-policy";
import { STRIPE_API_VERSION } from "../src/lib/stripe-api-version";

const APPLY_FLAG = "--apply";
const apply = process.argv.includes(APPLY_FLAG);
// A Render Shell is a separate process: it does not inherit values assigned by
// start.mjs. Verify the same built release manifest directly, without fabricating
// host metadata or requiring a process-local source variable from the server.
const renderRelease =
  getDeploymentIdentity().provider === "render"
    ? JSON.parse(readFileSync(new URL("../dist/render-release.json", import.meta.url), "utf8"))
    : undefined;
const { appUrl, secretKey } = assertStripePortalOperatorEnvironment(process.env, {
  apply,
  renderRelease,
});

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true });
// Payment methods, invoices and period-end cancellation only. Package changes
// remain unavailable until resource retention and subscription items reconcile.
const portalProducts: PortalProduct[] = [];

const fingerprint = portalProductsFingerprint(portalProducts);
// Stripe omits the portal's allowed product/price catalog unless it is explicitly
// expanded. Audit the authoritative catalog instead of relying on the metadata
// attestation fallback for ordinary production deploys.
const configurations = await stripe.billingPortal.configurations.list({
  active: true,
  expand: ["data.features.subscription_update.products"],
  limit: 100,
});
if (configurations.has_more) {
  throw new Error("Stripe has more than 100 active portal configurations; refusing partial audit.");
}
function isCurrentManagedConfiguration(candidate: Stripe.BillingPortal.Configuration): boolean {
  return (
    candidate.metadata?.wireline_managed === "true" &&
    candidate.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION &&
    candidate.metadata?.wireline_portal_products_fp === fingerprint
  );
}

// Stripe cannot deactivate its default configuration. Preserve a default that
// we already manage, updating it in place across catalog generations rather
// than creating a replacement that leaves an undeletable stale configuration.
// Never adopt a Dashboard default that is not explicitly BotBound-managed.
const managedDefaults = configurations.data.filter(
  (candidate) => candidate.is_default && candidate.metadata?.wireline_managed === "true",
);
if (managedDefaults.length > 1) {
  throw new Error("Stripe returned multiple default managed portal configurations.");
}
let configuration = managedDefaults[0] || configurations.data.find(isCurrentManagedConfiguration);

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

const verified = await stripe.billingPortal.configurations.retrieve(configuration.id, {
  expand: ["features.subscription_update.products"],
});
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
  if (staleManaged.some((candidate) => candidate.is_default)) {
    throw new Error("Refusing to deactivate a default Stripe portal configuration.");
  }
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
  throw new Error("Stripe must have exactly one active BotBound-managed portal configuration.");
}

console.log(
  `Stripe customer portal ready: ${verified.id} (${portalProducts.length} public plans, fingerprint ${fingerprint}).`,
);
