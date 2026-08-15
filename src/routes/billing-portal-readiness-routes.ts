import { eq } from "drizzle-orm";
import { Router } from "express";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import {
  FOUNDER_CATALOG_VERSION,
  planLookupKey,
  STRIPE_PLANS,
  type StripePlan,
} from "../lib/plan-catalog";
import { getErrorMessage } from "../lib/server-utils";
import { auditLogger, drizzle, log } from "../lib/server-context";
import { isMissingStripeResource, stripe, stripeAvailable } from "../lib/stripe-helpers";
import { stripePriceMatchesFounderPlan } from "../lib/stripe-founder-price-contract";
import { resolveOwnedStripeCustomer } from "../lib/stripe-customer-binding";
import {
  managedPortalConfigurationFindings,
  managedPortalConfigurationIdempotencyKey,
  managedPortalConfigurationParams,
  portalProductsFingerprint,
  type PortalProduct,
} from "../lib/stripe-portal-policy";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
type PortalConfigCache = {
  id: string;
  fingerprint: string;
  baseUrl: string;
  verifiedAt: number;
};

let portalConfigurationCache: PortalConfigCache | null = null;
let portalConfigurationPromise: Promise<string> | null = null;
const PORTAL_CONFIGURATION_REVERIFY_MS = 5 * 60_000;

type ManagedPriceSpec = {
  id: string;
  interval: "month" | "year";
  lookupKey: string;
  plan: StripePlan;
};

function managedPriceSpecifications(): ManagedPriceSpec[] {
  const paidPlans = STRIPE_PLANS.filter(
    (plan) => plan.price_usd_monthly > 0 && plan.public !== false,
  );
  const specifications = paidPlans.flatMap((plan) => [
    {
      id:
        (plan.priceIdEnv ? process.env[plan.priceIdEnv]?.trim() : "") || plan.fallbackPriceId || "",
      interval: "month" as const,
      lookupKey: planLookupKey(plan, "month") || "",
      plan,
    },
    {
      id:
        (plan.annualPriceIdEnv ? process.env[plan.annualPriceIdEnv]?.trim() : "") ||
        plan.fallbackAnnualPriceId ||
        "",
      interval: "year" as const,
      lookupKey: planLookupKey(plan, "year") || "",
      plan,
    },
  ]);
  if (
    specifications.some((specification) => !specification.id || !specification.lookupKey) ||
    new Set(specifications.map((specification) => specification.id)).size !== specifications.length
  ) {
    throw new Error("The public Stripe portal price catalog is incomplete or duplicated.");
  }
  return specifications;
}

/** Stable fingerprint so portal upgrade/downgrade choices track live price ids. */
async function managedPortalProducts(): Promise<PortalProduct[]> {
  const specifications = managedPriceSpecifications();
  const byProduct = new Map<string, string[]>();

  const prices = await Promise.all(
    specifications.map(async (specification) => ({
      specification,
      price: await stripe.prices.retrieve(specification.id, { expand: ["product"] }),
    })),
  );
  for (const { specification, price } of prices) {
    const product =
      typeof price.product === "string" || "deleted" in price.product ? null : price.product;
    const productId = product?.id;
    if (
      !stripePriceMatchesFounderPlan(price, specification.plan, specification.interval) ||
      !productId ||
      product.active !== true
    ) {
      throw new Error(
        `Stripe portal price ${specification.id} failed the launch catalog contract.`,
      );
    }
    const productPrices = byProduct.get(productId) || [];
    productPrices.push(price.id);
    byProduct.set(productId, productPrices);
  }

  const expectedProducts = specifications.length / 2;
  if (
    byProduct.size !== expectedProducts ||
    [...byProduct.values()].some((productPrices) => productPrices.length !== 2)
  ) {
    throw new Error("The public Stripe portal catalog must resolve to one product per paid plan.");
  }

  return [...byProduct.entries()].map(([product, prices]) => ({ product, prices }));
}

async function createManagedPortalConfiguration(
  baseUrl: string,
  products: PortalProduct[],
  fingerprint: string,
): Promise<string> {
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  if (existing.has_more) {
    throw new Error("Stripe returned more than 100 active portal configurations.");
  }
  const managed = existing.data.find(
    (configuration) =>
      configuration.metadata?.wireline_managed === "true" &&
      configuration.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION &&
      configuration.metadata?.wireline_portal_products_fp === fingerprint,
  );
  if (managed) {
    const findings = managedPortalConfigurationFindings(managed, baseUrl, products);
    if (findings.length === 0) return managed.id;

    const updated = await stripe.billingPortal.configurations.update(
      managed.id,
      managedPortalConfigurationParams(baseUrl, products),
    );
    const updatedFindings = managedPortalConfigurationFindings(updated, baseUrl, products);
    if (updatedFindings.length > 0) {
      throw new Error(`Stripe portal configuration drift remains: ${updatedFindings.join(", ")}`);
    }
    return updated.id;
  }

  const configuration = await stripe.billingPortal.configurations.create(
    managedPortalConfigurationParams(baseUrl, products),
    {
      idempotencyKey: managedPortalConfigurationIdempotencyKey(products),
    },
  );

  log.info("Created managed Stripe customer portal configuration", {
    configurationId: configuration.id,
    products: products.length,
    fingerprint,
  });
  return configuration.id;
}

async function ensureManagedPortalConfiguration(baseUrl: string): Promise<string> {
  const products = await managedPortalProducts();
  const fingerprint = portalProductsFingerprint(products);

  if (
    portalConfigurationCache &&
    portalConfigurationCache.baseUrl === baseUrl &&
    portalConfigurationCache.fingerprint === fingerprint
  ) {
    if (Date.now() - portalConfigurationCache.verifiedAt < PORTAL_CONFIGURATION_REVERIFY_MS) {
      return portalConfigurationCache.id;
    }
    try {
      const cached = await stripe.billingPortal.configurations.retrieve(
        portalConfigurationCache.id,
      );
      if (managedPortalConfigurationFindings(cached, baseUrl, products).length === 0) {
        portalConfigurationCache.verifiedAt = Date.now();
        return cached.id;
      }
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
    portalConfigurationCache = null;
  }

  if (!portalConfigurationPromise) {
    portalConfigurationPromise = createManagedPortalConfiguration(baseUrl, products, fingerprint)
      .then((id) => {
        portalConfigurationCache = { id, fingerprint, baseUrl, verifiedAt: Date.now() };
        portalConfigurationPromise = null;
        return id;
      })
      .catch((error) => {
        portalConfigurationPromise = null;
        throw error;
      });
  }
  return portalConfigurationPromise;
}

/**
 * Canonical customer-portal writer — sole owner of POST /api/billing/portal.
 * Self-heals missing Stripe Dashboard defaults so paying customers are never
 * stranded on an unconfigured portal configuration. Rebuilds when the live
 * price/product fingerprint drifts inside the same founder catalog version.
 */
router.post("/api/billing/portal", authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!stripeAvailable()) throw AppError.fromHttpStatus(503, "Stripe not configured.");

    const [subscription] = await drizzle
      .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, req.user!.id))
      .limit(1);

    if (!subscription?.stripeCustomerId) {
      return res.status(404).json({
        error: "No Stripe customer exists for this workspace yet. Complete checkout first.",
        code: "STRIPE_CUSTOMER_REQUIRED",
      });
    }

    let customer;
    try {
      customer = await stripe.customers.retrieve(subscription.stripeCustomerId);
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
      return res.status(404).json({
        error: "Stripe customer record is missing. Complete checkout to recreate it.",
        code: "STRIPE_CUSTOMER_MISSING",
      });
    }
    if ("deleted" in customer && customer.deleted) {
      return res.status(404).json({
        error: "Stripe customer record is missing. Complete checkout to recreate it.",
        code: "STRIPE_CUSTOMER_MISSING",
      });
    }
    const ownedCustomer = await resolveOwnedStripeCustomer({
      customerId: customer.id,
      userId: req.user!.id,
      authenticatedEmail: req.user!.email,
    });
    if (!ownedCustomer) {
      log.error("Refusing Stripe portal access for a customer bound to another tenant", {
        userId: req.user!.id,
        customerId: subscription.stripeCustomerId,
      });
      return res.status(409).json({
        error: "Billing customer ownership could not be verified. Contact Wireline support.",
        code: "STRIPE_CUSTOMER_OWNERSHIP_MISMATCH",
      });
    }

    const appUrl = resolveCanonicalAppUrl();
    if ("error" in appUrl) {
      return res.status(503).json({
        error: "Billing portal unavailable: APP_URL is not configured.",
        code: "PORTAL_NOT_CONFIGURED",
      });
    }

    const configuration = await ensureManagedPortalConfiguration(appUrl.url);
    const portal = await stripe.billingPortal.sessions.create({
      customer: ownedCustomer.id,
      configuration,
      return_url: `${appUrl.url}/settings/billing`,
    });

    res.json({ url: portal.url });
    void auditLogger
      .logBilling("portal_opened", {
        userId: req.user!.id,
        customerId: ownedCustomer.id,
        ip: req.ip,
        metadata: { configuration_id: configuration },
      })
      .catch((error) =>
        log.warn("billing audit log failed", {
          event: "portal_opened",
          error: getErrorMessage(error),
        }),
      );
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const stripeError = error as {
      type?: string;
      code?: string;
      statusCode?: number;
      requestId?: string;
      message?: string;
    };
    log.error("Managed Stripe portal session failed", {
      userId: req.user?.id,
      type: stripeError.type,
      code: stripeError.code,
      statusCode: stripeError.statusCode,
      requestId: stripeError.requestId,
      error: getErrorMessage(error),
    });

    if (stripeError.type === "StripeAuthenticationError") {
      return res.status(503).json({
        error: "Stripe authentication failed. Billing is temporarily unavailable.",
        code: "STRIPE_AUTH_ERROR",
      });
    }
    if (isMissingStripeResource(error)) {
      portalConfigurationCache = null;
      return res.status(503).json({
        error: "Billing portal configuration is being repaired. Try again shortly.",
        code: "PORTAL_NOT_CONFIGURED",
      });
    }

    throw AppError.fromHttpStatus(503, "Billing portal is temporarily unavailable.");
  }
});

export default router;
