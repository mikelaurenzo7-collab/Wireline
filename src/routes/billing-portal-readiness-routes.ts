import { eq } from "drizzle-orm";
import { Router } from "express";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { FOUNDER_CATALOG_VERSION, STRIPE_PLANS } from "../lib/plan-catalog";
import { getErrorMessage } from "../lib/server-utils";
import { auditLogger, drizzle, log } from "../lib/server-context";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const MANAGED_PORTAL_METADATA_KEY = "wireline_managed";
const MANAGED_PORTAL_IDEMPOTENCY_KEY = "wireline-managed-customer-portal-v1";

type PortalProduct = {
  product: string;
  prices: string[];
};

let portalConfigurationPromise: Promise<string> | null = null;

function managedMonthlyPriceIds(): string[] {
  return [
    ...new Set(
      STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0 && plan.public !== false)
        .map((plan) => process.env[plan.priceIdEnv]?.trim() || plan.fallbackPriceId || "")
        .filter(Boolean),
    ),
  ];
}

async function managedPortalProducts(): Promise<PortalProduct[]> {
  const byProduct = new Map<string, string[]>();

  for (const priceId of managedMonthlyPriceIds()) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active || price.type !== "recurring") continue;
      const productId = typeof price.product === "string" ? price.product : price.product?.id;
      if (!productId) continue;
      const prices = byProduct.get(productId) || [];
      if (!prices.includes(price.id)) prices.push(price.id);
      byProduct.set(productId, prices);
    } catch (error) {
      log.warn("Stripe portal skipped an unavailable catalog price", {
        priceId,
        error: getErrorMessage(error),
      });
    }
  }

  return [...byProduct.entries()].map(([product, prices]) => ({ product, prices }));
}

async function createManagedPortalConfiguration(baseUrl: string): Promise<string> {
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const managed = existing.data.find(
    (configuration) => configuration.metadata?.[MANAGED_PORTAL_METADATA_KEY] === "true",
  );
  if (managed) return managed.id;

  const products = await managedPortalProducts();
  const configuration = await stripe.billingPortal.configurations.create(
    {
      business_profile: {
        headline: "Manage your Wireline billing, invoices, and subscription.",
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
            options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
          },
        },
        subscription_update: products.length
          ? {
              enabled: true,
              default_allowed_updates: ["price"],
              proration_behavior: "create_prorations",
              products,
            }
          : { enabled: false },
      },
      metadata: {
        [MANAGED_PORTAL_METADATA_KEY]: "true",
        wireline_catalog_version: FOUNDER_CATALOG_VERSION,
      },
    },
    { idempotencyKey: MANAGED_PORTAL_IDEMPOTENCY_KEY },
  );

  log.info("Created managed Stripe customer portal configuration", {
    configurationId: configuration.id,
    products: products.length,
  });
  return configuration.id;
}

async function ensureManagedPortalConfiguration(baseUrl: string): Promise<string> {
  if (!portalConfigurationPromise) {
    portalConfigurationPromise = createManagedPortalConfiguration(baseUrl).catch((error) => {
      portalConfigurationPromise = null;
      throw error;
    });
  }
  return portalConfigurationPromise;
}

/**
 * Canonical customer-portal writer. It precedes the broad legacy billing router
 * so a missing Stripe Dashboard default can never strand a paying customer.
 */
router.post(
  "/api/billing/portal",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
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

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res.status(503).json({
          error: "Billing portal unavailable: APP_URL is not configured.",
          code: "PORTAL_NOT_CONFIGURED",
        });
      }

      const configuration = await ensureManagedPortalConfiguration(appUrl.url);
      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        configuration,
        return_url: `${appUrl.url}/settings/billing`,
      });

      res.json({ url: portal.url });
      void auditLogger
        .logBilling("portal_opened", {
          userId: req.user!.id,
          customerId: subscription.stripeCustomerId,
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
      if (
        stripeError.code === "resource_missing" ||
        /No such customer/i.test(stripeError.message || "")
      ) {
        return res.status(404).json({
          error: "Stripe customer record is missing. Complete checkout to recreate it.",
          code: "STRIPE_CUSTOMER_MISSING",
        });
      }

      throw AppError.fromHttpStatus(500, "Portal failed");
    }
  },
);

export default router;
