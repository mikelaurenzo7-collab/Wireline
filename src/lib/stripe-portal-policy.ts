import { createHash } from "node:crypto";

import type Stripe from "stripe";

import { FOUNDER_CATALOG_VERSION } from "./plan-catalog";

export const MANAGED_PORTAL_METADATA_KEY = "wireline_managed";
export const PORTAL_PRODUCTS_FINGERPRINT_KEY = "wireline_portal_products_fp";
export const PORTAL_CATALOG_ATTESTED_AT_KEY = "wireline_portal_catalog_attested_at";
const PORTAL_ATTESTATION_CLOCK_SKEW_SECONDS = 5;
const PORTAL_HEADLINE = "Manage your Wireline billing, invoices, and subscription.";
const CANCELLATION_REASONS = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "other",
] as const;

export type PortalProduct = {
  product: string;
  prices: string[];
};

/** Portal access is privileged: the Stripe object must prove the same tenant. */
export function stripeCustomerBelongsToUser(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  userId: string,
): customer is Stripe.Customer {
  return (
    !("deleted" in customer && customer.deleted) &&
    customer.metadata?.wireline_user_id?.trim() === userId
  );
}

function normalizedProducts(products: PortalProduct[]): PortalProduct[] {
  return products
    .map(({ product, prices }) => ({ product, prices: [...new Set(prices)].sort() }))
    .sort((left, right) => left.product.localeCompare(right.product));
}

export function portalProductsFingerprint(products: PortalProduct[]): string {
  const normalized = normalizedProducts(products)
    .map((item) => `${item.product}:${item.prices.join(",")}`)
    .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function managedPortalConfigurationParams(
  baseUrl: string,
  products: PortalProduct[],
): Stripe.BillingPortal.ConfigurationCreateParams {
  const fingerprint = portalProductsFingerprint(products);
  const catalogAttestedAt = Math.floor(Date.now() / 1000);
  return {
    business_profile: {
      headline: PORTAL_HEADLINE,
      privacy_policy_url: `${baseUrl}/privacy`,
      terms_of_service_url: `${baseUrl}/terms`,
    },
    default_return_url: `${baseUrl}/settings/billing`,
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: [...CANCELLATION_REASONS],
        },
      },
      subscription_update: products.length
        ? {
            enabled: true,
            default_allowed_updates: ["price"],
            proration_behavior: "create_prorations",
            products: normalizedProducts(products),
          }
        : { enabled: false },
    },
    metadata: {
      [MANAGED_PORTAL_METADATA_KEY]: "true",
      wireline_catalog_version: FOUNDER_CATALOG_VERSION,
      [PORTAL_PRODUCTS_FINGERPRINT_KEY]: fingerprint,
      [PORTAL_CATALOG_ATTESTED_AT_KEY]: String(catalogAttestedAt),
    },
  };
}

export function managedPortalConfigurationIdempotencyKey(products: PortalProduct[]): string {
  return `wireline-managed-customer-portal-${FOUNDER_CATALOG_VERSION}-${portalProductsFingerprint(products)}`;
}

function stringSet(values: unknown): Set<string> {
  return new Set(
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string")
      : [],
  );
}

export function managedPortalConfigurationFindings(
  configuration: Stripe.BillingPortal.Configuration,
  baseUrl: string,
  products: PortalProduct[],
): string[] {
  const findings: string[] = [];
  const fingerprint = portalProductsFingerprint(products);
  const features = configuration.features;

  if (!configuration.active) findings.push("inactive");
  if (!configuration.livemode) findings.push("not_live_mode");
  if (configuration.metadata?.[MANAGED_PORTAL_METADATA_KEY] !== "true") {
    findings.push("managed_metadata_missing");
  }
  if (configuration.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) {
    findings.push("catalog_version_mismatch");
  }
  if (configuration.metadata?.[PORTAL_PRODUCTS_FINGERPRINT_KEY] !== fingerprint) {
    findings.push("products_fingerprint_mismatch");
  }
  if (configuration.default_return_url !== `${baseUrl}/settings/billing`) {
    findings.push("return_url_mismatch");
  }
  if (
    configuration.business_profile?.headline !== PORTAL_HEADLINE ||
    configuration.business_profile?.privacy_policy_url !== `${baseUrl}/privacy` ||
    configuration.business_profile?.terms_of_service_url !== `${baseUrl}/terms`
  ) {
    findings.push("legal_urls_mismatch");
  }

  const allowedCustomerUpdates = stringSet(features.customer_update?.allowed_updates);
  if (
    features.customer_update?.enabled !== true ||
    allowedCustomerUpdates.size !== 2 ||
    !allowedCustomerUpdates.has("email") ||
    !allowedCustomerUpdates.has("address")
  ) {
    findings.push("customer_update_incomplete");
  }
  if (features.invoice_history?.enabled !== true) findings.push("invoice_history_disabled");
  if (features.payment_method_update?.enabled !== true) {
    findings.push("payment_method_update_disabled");
  }
  if (
    features.subscription_cancel?.enabled !== true ||
    features.subscription_cancel?.mode !== "at_period_end" ||
    features.subscription_cancel?.proration_behavior !== "none"
  ) {
    findings.push("subscription_cancel_incomplete");
  }
  const cancellationReasons = stringSet(features.subscription_cancel?.cancellation_reason?.options);
  if (
    features.subscription_cancel?.cancellation_reason?.enabled !== true ||
    cancellationReasons.size !== CANCELLATION_REASONS.length ||
    CANCELLATION_REASONS.some((reason) => !cancellationReasons.has(reason))
  ) {
    findings.push("cancellation_reason_disabled");
  }
  if (
    features.subscription_update?.enabled !== true ||
    features.subscription_update?.proration_behavior !== "create_prorations" ||
    stringSet(features.subscription_update?.default_allowed_updates).size !== 1 ||
    !stringSet(features.subscription_update?.default_allowed_updates).has("price")
  ) {
    findings.push("subscription_update_incomplete");
  }

  const returnedProducts = features.subscription_update?.products;
  if (Array.isArray(returnedProducts)) {
    const expectedProducts = new Map(
      normalizedProducts(products).map((product) => [product.product, product.prices.join(",")]),
    );
    const actualProducts = new Map(
      returnedProducts.map((product) => [product.product, [...product.prices].sort().join(",")]),
    );
    for (const [product, prices] of expectedProducts) {
      if (actualProducts.get(product) !== prices) findings.push(`plan_switch_mismatch:${product}`);
    }
    for (const product of actualProducts.keys()) {
      if (!expectedProducts.has(product)) {
        findings.push(`unexpected_plan_switch_product:${product}`);
      }
    }
  } else {
    // Stripe can omit subscription_update.products from a live configuration
    // read even after accepting the exact catalog on create/update. Bind the
    // metadata fingerprint to the same write's updated timestamp so a later
    // Dashboard edit invalidates the attestation instead of silently passing.
    const catalogAttestedAt = Number(configuration.metadata?.[PORTAL_CATALOG_ATTESTED_AT_KEY]);
    if (
      !Number.isInteger(catalogAttestedAt) ||
      !Number.isInteger(configuration.updated) ||
      Math.abs(configuration.updated - catalogAttestedAt) > PORTAL_ATTESTATION_CLOCK_SKEW_SECONDS
    ) {
      findings.push("plan_switch_catalog_unverifiable");
    }
  }

  return findings;
}
