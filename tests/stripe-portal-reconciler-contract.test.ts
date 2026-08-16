import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  managedPortalConfigurationFindings,
  managedPortalConfigurationIdempotencyKey,
  managedPortalConfigurationParams,
  portalProductsFingerprint,
  stripeCustomerBelongsToUser,
  type PortalProduct,
} from "../src/lib/stripe-portal-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const products: PortalProduct[] = [
  { product: "prod_team", prices: ["price_team_year", "price_team_month"] },
  { product: "prod_starter", prices: ["price_starter_month", "price_starter_year"] },
  { product: "prod_pro", prices: ["price_pro_year", "price_pro_month"] },
];

describe("Stripe customer portal reconciliation", () => {
  it("refuses a deleted or cross-tenant Stripe customer projection", () => {
    expect(
      stripeCustomerBelongsToUser(
        { id: "cus_owner", metadata: { wireline_user_id: "user-owner" } } as never,
        "user-owner",
      ),
    ).toBe(true);
    expect(
      stripeCustomerBelongsToUser(
        { id: "cus_other", metadata: { wireline_user_id: "user-other" } } as never,
        "user-owner",
      ),
    ).toBe(false);
    expect(
      stripeCustomerBelongsToUser({ id: "cus_deleted", deleted: true } as never, "user-owner"),
    ).toBe(false);
  });

  it("keeps the product fingerprint and idempotency key order-independent", () => {
    const reversed = [...products]
      .reverse()
      .map((product) => ({ ...product, prices: [...product.prices].reverse() }));

    expect(portalProductsFingerprint(reversed)).toBe(portalProductsFingerprint(products));
    expect(managedPortalConfigurationIdempotencyKey(reversed)).toBe(
      managedPortalConfigurationIdempotencyKey(products),
    );
  });

  it("builds the exact launch-safe customer controls", () => {
    const params = managedPortalConfigurationParams("https://trywireline.com", products);

    expect(params.default_return_url).toBe("https://trywireline.com/settings/billing");
    expect(params.business_profile?.privacy_policy_url).toBe("https://trywireline.com/privacy");
    expect(params.business_profile?.terms_of_service_url).toBe("https://trywireline.com/terms");
    expect(params.features.payment_method_update.enabled).toBe(true);
    expect(params.features.invoice_history.enabled).toBe(true);
    expect(params.features.subscription_cancel).toMatchObject({
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
    });
    expect(params.features.subscription_update).toMatchObject({
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
    });
    expect(params.features.subscription_update.products).toHaveLength(3);
  });

  it("detects customer-control and plan-switch drift after write", () => {
    const params = managedPortalConfigurationParams("https://trywireline.com", products);
    const configuration = {
      id: "bpc_test",
      object: "billing_portal.configuration",
      active: true,
      application: null,
      business_profile: params.business_profile,
      created: 0,
      default_return_url: params.default_return_url,
      features: params.features,
      is_default: false,
      livemode: true,
      login_page: { enabled: false, url: null },
      metadata: params.metadata,
      updated: 0,
    } as never;

    expect(
      managedPortalConfigurationFindings(configuration, "https://trywireline.com", products),
    ).toEqual([]);

    const drifted = {
      ...configuration,
      features: {
        ...params.features,
        subscription_cancel: { ...params.features.subscription_cancel, mode: "immediately" },
        subscription_update: {
          ...params.features.subscription_update,
          default_allowed_updates: ["price", "quantity"],
          products: [{ product: "prod_starter", prices: ["price_starter_month"] }],
        },
      },
    } as never;
    expect(
      managedPortalConfigurationFindings(drifted, "https://trywireline.com", products),
    ).toEqual(
      expect.arrayContaining([
        "subscription_cancel_incomplete",
        "subscription_update_incomplete",
        "plan_switch_mismatch:prod_starter",
        "plan_switch_mismatch:prod_team",
        "plan_switch_mismatch:prod_pro",
      ]),
    );
  });

  it("accepts Stripe's omitted product readback only when the exact write is freshly attested", () => {
    const params = managedPortalConfigurationParams("https://trywireline.com", products);
    const attestedAt = Number(params.metadata?.wireline_portal_catalog_attested_at);
    const configuration = {
      id: "bpc_live",
      object: "billing_portal.configuration",
      active: true,
      application: null,
      business_profile: params.business_profile,
      created: attestedAt,
      default_return_url: params.default_return_url,
      features: {
        ...params.features,
        subscription_update: {
          ...params.features.subscription_update,
          products: undefined,
        },
      },
      is_default: true,
      livemode: true,
      login_page: { enabled: false, url: null },
      metadata: params.metadata,
      updated: attestedAt,
    } as never;

    expect(
      managedPortalConfigurationFindings(configuration, "https://trywireline.com", products),
    ).toEqual([]);
    expect(
      managedPortalConfigurationFindings(
        { ...configuration, updated: attestedAt + 30 } as never,
        "https://trywireline.com",
        products,
      ),
    ).toContain("plan_switch_catalog_unverifiable");
  });

  it("keeps production deploy verification read-only and provider repair explicit", () => {
    const script = read("scripts/reconcile-stripe-customer-portal.mts");
    const build = read("scripts/vercel-build.mjs");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const route = read("src/routes/billing-portal-readiness-routes.ts");
    const launchStatus = read("scripts/generate-launch-status.mjs");
    const webhookSecretSync = read("scripts/sync-stripe-webhook-secret-to-vercel.mjs");

    expect(script).toContain('environment !== "production"');
    expect(script).toContain("process.env.VERCEL_PROJECT_ID !== CANONICAL_VERCEL_PROJECT_ID");
    expect(script).toContain('appUrl !== "https://trywireline.com"');
    expect(script).toContain("/^(?:sk|rk)_live_/");
    expect(script).toContain("PUBLIC_SELF_SERVE_PLAN_IDS");
    expect(script).toContain("FOUNDER_PRODUCTS");
    expect(script).toContain("stripePriceMatchesFounderPlan");
    expect(script).toContain("product.name !== expectedProduct.name");
    expect(script).toContain("configuredPriceId !== price.id");
    expect(script).toContain("managedPortalConfigurationFindings");
    expect(script).toContain("staleManaged");
    expect(script).toContain("exactly one active Wireline-managed portal configuration");
    expect(build).toContain('process.env.WIRELINE_RECONCILE_STRIPE_PORTAL !== "true"');
    expect(build).toContain("isCanonicalVercelProject");
    expect(build).toContain("function verifyStripePortalIfRequested()");
    expect(build).toContain(
      'run("node", ["--import", "tsx", "scripts/reconcile-stripe-customer-portal.mts"]);',
    );
    expect(build).not.toContain(
      'run("node", ["--import", "tsx", "scripts/reconcile-stripe-customer-portal.mts", "--apply"]);',
    );
    expect(packageJson.scripts?.["stripe:portal:verify"]).toBe(
      "node --import tsx scripts/reconcile-stripe-customer-portal.mts",
    );
    expect(packageJson.scripts?.["stripe:portal:reconcile"]).toBe(
      "node --import tsx scripts/reconcile-stripe-customer-portal.mts --apply",
    );
    expect(route).toContain("resolveOwnedStripeCustomer({");
    expect(route).toContain("stripePriceMatchesFounderPlan");
    expect(route).toContain("authenticatedEmail: req.user!.email");
    expect(route).toContain("customer: ownedCustomer.id");
    expect(route).toContain("PORTAL_CONFIGURATION_REVERIFY_MS");
    expect(route).toContain('code: "STRIPE_CUSTOMER_OWNERSHIP_MISMATCH"');
    expect(route).toContain('code: "PORTAL_NOT_CONFIGURED"');
    expect(launchStatus).toContain('const PINNED_STRIPE_API_VERSION = "2026-07-29.dahlia"');
    expect(launchStatus).toContain('"Stripe-Version": PINNED_STRIPE_API_VERSION');
    expect(launchStatus).toContain("runtime_env_price_id_mismatch");
    expect(webhookSecretSync).toContain('target: ["production"]');
    expect(webhookSecretSync).toContain('type: "sensitive"');
    expect(webhookSecretSync).not.toContain("decrypt=true");
    expect(webhookSecretSync).not.toContain("console.log(secret");
  });
});
