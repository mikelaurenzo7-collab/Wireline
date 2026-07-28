import express, { type Response } from "express";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import {
  extraAgentItems,
  extraAgentMutationIdempotencyKey,
  extraAgentQuantity,
  hasPendingSubscriptionUpdate,
  isStripePaymentRequiredError,
  reconciledStoredAgentCap,
} from "../lib/extra-agent-billing";
import { FOUNDER_CATALOG_VERSION, planById } from "../lib/plan-catalog";
import { getErrorMessage } from "../lib/server-utils";
import { auditLogger, drizzle, log } from "../lib/server-context";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

type RouteOutcome = {
  status: number;
  body: Record<string, unknown>;
  audit?: { target: number; planId: string; reconciled: boolean };
};

function isDeployedRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function paymentRequiredOutcome(): RouteOutcome {
  return {
    status: 402,
    body: {
      code: "PAYMENT_REQUIRED",
      error:
        "We couldn't collect payment for the additional agents. Update your payment method and try again.",
    },
  };
}

async function validateFounderCatalogPriceId(priceId: string): Promise<string | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active) return null;
    if (price.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) return null;
    return price.id;
  } catch (error) {
    log.warn("Extra-agent Stripe price validation failed", {
      priceId,
      error: getErrorMessage(error),
    });
    return null;
  }
}

function latestInvoiceId(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice;
  if (!invoice) return null;
  return typeof invoice === "string" ? invoice : invoice.id;
}

/**
 * Atomic owner for POST /api/billing/extra-agents.
 *
 * This router is mounted before the broad billing router. The legacy GET remains
 * there, while writes settle here under a tenant advisory lock. Stripe is the
 * authoritative quantity whenever configured; Postgres is updated only after a
 * verified Stripe result, so a declined immediate invoice cannot grant capacity.
 */
router.post("/", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const target = Number(req.body?.count);
  if (!Number.isInteger(target) || target < 0 || target > 100) {
    throw AppError.fromHttpStatus(400, "count must be an integer 0-100");
  }

  try {
    const outcome = await drizzle.transaction(async (tx): Promise<RouteOutcome> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`billing-extra-agents:${req.user.id}`}))`,
      );

      const [row] = await tx
        .select({
          planId: schema.subscriptions.plan,
          stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
          currentExtraAgents: schema.settings.extraAgents,
          storedMaxAgents: schema.settings.maxAgents,
        })
        .from(schema.settings)
        .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      if (!row) throw AppError.fromHttpStatus(404, "Workspace billing settings not found");
      const plan = planById(row.planId || "personal");
      if (!plan) throw AppError.fromHttpStatus(400, "Plan not found");

      const currentDbQuantity = Math.max(0, Number(row.currentExtraAgents ?? 0));
      const persistQuantity = async (
        quantity: number,
        reconciled: boolean,
        previousAuthoritativeQuantity = currentDbQuantity,
      ): Promise<RouteOutcome> => {
        const maxAgents = reconciledStoredAgentCap({
          planMaxAgents: plan.max_agents,
          currentExtraAgents: previousAuthoritativeQuantity,
          targetExtraAgents: quantity,
          storedMaxAgents: row.storedMaxAgents,
        });
        await tx
          .update(schema.settings)
          .set({ extraAgents: quantity, maxAgents, updatedAt: new Date() })
          .where(eq(schema.settings.userId, req.user.id));
        return {
          status: 200,
          body: {
            ok: true,
            extra_agents: quantity,
            agents_total: maxAgents,
            reconciled,
          },
          audit: { target: quantity, planId: plan.id, reconciled },
        };
      };

      if (!stripeAvailable()) {
        if (isDeployedRuntime()) {
          return {
            status: 503,
            body: {
              code: "SERVICE_UNAVAILABLE",
              error: "Stripe is not configured, so extra-agent entitlement changes are paused.",
            },
          };
        }
        return persistQuantity(target, true);
      }

      const subscriptionId = row.stripeSubscriptionId;
      if (!subscriptionId) {
        if (target === 0) return persistQuantity(0, currentDbQuantity !== 0);
        return {
          status: 400,
          body: {
            code: "BAD_REQUEST",
            error: "No active subscription found. Upgrade to a paid plan first.",
          },
        };
      }

      let subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (hasPendingSubscriptionUpdate(subscription)) {
        return {
          status: 409,
          body: {
            code: "BILLING_CHANGE_PENDING",
            error:
              "A previous subscription change is still awaiting settlement. Complete or resolve that invoice before changing agent capacity again.",
            invoice_id: latestInvoiceId(subscription),
          },
        };
      }

      const activeForPaidCapacity =
        subscription.status === "active" || subscription.status === "trialing";
      if (target > 0 && !activeForPaidCapacity) {
        return {
          status: 402,
          body: {
            code: "SUBSCRIPTION_REQUIRED",
            error: "Restore an active subscription before retaining or purchasing extra agents.",
          },
        };
      }

      const priceIdEnv = plan.extraAgentPriceIdEnv;
      const configuredPriceId = priceIdEnv ? process.env[priceIdEnv] : undefined;
      const matchingItems = extraAgentItems(subscription, configuredPriceId || "none");
      if (matchingItems.length > 1) {
        log.error("Multiple Extra Agent subscription items require manual reconciliation", {
          userId: req.user.id,
          subscriptionId,
          itemIds: matchingItems.map((item) => item.id),
        });
        return {
          status: 409,
          body: {
            code: "BILLING_RECONCILIATION_REQUIRED",
            error:
              "Multiple Extra Agent billing lines were found. Capacity was not changed; support must reconcile the subscription first.",
          },
        };
      }

      const existing = matchingItems[0];
      const currentStripeQuantity = extraAgentQuantity(matchingItems);
      const isIncrease = target > currentStripeQuantity;

      if (target === currentStripeQuantity) {
        return persistQuantity(target, currentDbQuantity !== target, currentStripeQuantity);
      }

      let createPriceId: string | null = null;
      if (!existing && target > 0) {
        if (!priceIdEnv || !configuredPriceId) {
          return {
            status: 503,
            body: {
              code: "SERVICE_UNAVAILABLE",
              error: `Extra-agent billing is not configured for ${plan.name}.`,
            },
          };
        }
        createPriceId = await validateFounderCatalogPriceId(configuredPriceId);
        if (!createPriceId) {
          return {
            status: 503,
            body: {
              code: "SERVICE_UNAVAILABLE",
              error: `Extra-agent pricing for ${plan.name} is not in the current Wireline catalog.`,
            },
          };
        }
      }

      const idempotencyKey = extraAgentMutationIdempotencyKey({
        subscription,
        configuredPriceId: existing?.price.id || createPriceId || configuredPriceId || "none",
        currentQuantity: currentStripeQuantity,
        targetQuantity: target,
      });

      try {
        if (existing) {
          if (target === 0) {
            await stripe.subscriptionItems.del(
              existing.id,
              { proration_behavior: "create_prorations" },
              { idempotencyKey },
            );
          } else {
            await stripe.subscriptionItems.update(
              existing.id,
              {
                quantity: target,
                proration_behavior: isIncrease ? "always_invoice" : "create_prorations",
                ...(isIncrease ? { payment_behavior: "error_if_incomplete" as const } : {}),
              },
              { idempotencyKey },
            );
          }
        } else if (target > 0 && createPriceId) {
          await stripe.subscriptionItems.create(
            {
              subscription: subscriptionId,
              price: createPriceId,
              quantity: target,
              proration_behavior: "always_invoice",
              payment_behavior: "error_if_incomplete",
            },
            { idempotencyKey },
          );
        }
      } catch (error) {
        if (isIncrease && isStripePaymentRequiredError(error)) {
          log.warn("Extra-agent payment failed without granting capacity", {
            userId: req.user.id,
            subscriptionId,
            target,
            error: getErrorMessage(error),
          });
          return paymentRequiredOutcome();
        }
        log.error("Stripe Extra Agent mutation failed", {
          userId: req.user.id,
          subscriptionId,
          target,
          error: getErrorMessage(error),
        });
        return {
          status: 502,
          body: {
            code: "BAD_GATEWAY",
            error: "Stripe could not update agent capacity. No local entitlement was changed.",
          },
        };
      }

      // Verify the provider state after the mutation. This catches a stale SDK
      // response, an unexpected pending update, or a catalog drift duplicate
      // before any capacity is granted in Postgres.
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (hasPendingSubscriptionUpdate(subscription)) return paymentRequiredOutcome();
      const verifiedItems = extraAgentItems(
        subscription,
        existing?.price.id || createPriceId || configuredPriceId || "none",
      );
      const verifiedQuantity = extraAgentQuantity(verifiedItems);
      if (verifiedItems.length > 1 || verifiedQuantity !== target) {
        log.error("Stripe Extra Agent quantity verification failed", {
          userId: req.user.id,
          subscriptionId,
          target,
          verifiedQuantity,
          itemIds: verifiedItems.map((item) => item.id),
        });
        return {
          status: 502,
          body: {
            code: "BILLING_RECONCILIATION_REQUIRED",
            error:
              "Stripe did not confirm the requested capacity. No local entitlement was changed.",
          },
        };
      }

      return persistQuantity(target, currentDbQuantity !== target, currentStripeQuantity);
    });

    if (outcome.audit) {
      void auditLogger
        .logBilling("subscription_updated", {
          userId: req.user.id,
          metadata: {
            reason: "extra_agents_changed_atomic",
            target: outcome.audit.target,
            plan_id: outcome.audit.planId,
            reconciled: outcome.audit.reconciled,
          },
        })
        .catch((error) =>
          log.warn("Extra Agent billing audit log failed", { error: getErrorMessage(error) }),
        );
    }

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("Atomic Extra Agent billing route failed", {
      userId: req.user.id,
      target,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(500, "Failed to update extra agents");
  }
});

export default router;
