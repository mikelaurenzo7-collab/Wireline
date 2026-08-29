import express, { type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { acquireAccountDeletionFence } from "../lib/account-deletion-fence";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
} from "../lib/billing-release";
import {
  extraAgentItems,
  extraAgentMutationIdempotencyKey,
  extraAgentQuantity,
  hasPendingSubscriptionUpdate,
  isStripePaymentRequiredError,
  reconciledStoredAgentCap,
} from "../lib/extra-agent-billing";
import { isLaunchHardBlocked, launchBlockResponse } from "../lib/launch-readiness";
import { FOUNDER_CATALOG_VERSION, planById } from "../lib/plan-catalog";
import { getErrorMessage } from "../lib/server-utils";
import { auditLogger, drizzle, log } from "../lib/server-context";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import {
  FairKeyedConcurrencyGate,
  FairKeyedConcurrencyGateAdmissionError,
  type FairKeyedConcurrencyPermit,
} from "../lib/fair-keyed-concurrency-gate";
import { MAX_EXTRA_AGENT_ADDONS } from "../lib/agent-capacity";

const router = express.Router();

// Every process owns a five-connection pool. Extra-agent mutations hold one
// connection across Stripe settlement so they can preserve the exact capacity
// and deletion locks. Admit at most two, leaving three connections for auth,
// webhooks, deletion, and ordinary product traffic. Cross-instance correctness
// remains owned by the database advisory locks inside the transaction.
const EXTRA_AGENT_BILLING_CONCURRENCY = 2;
const EXTRA_AGENT_BILLING_MAX_QUEUE = 8;
const EXTRA_AGENT_BILLING_WAIT_MS = 5_000;
const EXTRA_AGENT_BILLING_RETRY_AFTER_SECONDS = 5;
const extraAgentBillingGate = new FairKeyedConcurrencyGate(
  EXTRA_AGENT_BILLING_CONCURRENCY,
  EXTRA_AGENT_BILLING_MAX_QUEUE,
  EXTRA_AGENT_BILLING_WAIT_MS,
);

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

function billingBusyResponse(res: Response) {
  return res.set("Retry-After", String(EXTRA_AGENT_BILLING_RETRY_AFTER_SECONDS)).status(429).json({
    code: "BILLING_BUSY",
    error: "Another billing change is still settling. Try again in a few seconds.",
  });
}

/** Match only PostgreSQL's lock-timeout shape, never generic DB failures. */
function isPostgresLockTimeout(error: unknown): boolean {
  let current = error as { code?: unknown; message?: unknown; cause?: unknown } | null;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (
      current.code === "55P03" &&
      typeof current.message === "string" &&
      /lock timeout/i.test(current.message)
    ) {
      return true;
    }
    current =
      current.cause && typeof current.cause === "object"
        ? (current.cause as { code?: unknown; message?: unknown; cause?: unknown })
        : null;
  }
  return false;
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
 * there, while writes settle here under the same tenant capacity lock used by
 * every agent-creation surface. Stripe is authoritative whenever configured;
 * Postgres is updated only after a verified result, so a declined immediate
 * invoice cannot grant capacity and a concurrent downgrade cannot race a final
 * agent insert through the old allowance.
 */
router.post("/", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const target = Number(req.body?.count);
  if (!Number.isInteger(target) || target < 0 || target > MAX_EXTRA_AGENT_ADDONS) {
    throw AppError.fromHttpStatus(400, `count must be an integer 0-${MAX_EXTRA_AGENT_ADDONS}`);
  }

  const environmentPolicy = await liveExternalActionPolicyForUser(req.user.id);
  if (!environmentPolicy.allowed) {
    return res.status(environmentPolicy.status).json({
      code: environmentPolicy.code,
      error: environmentPolicy.message,
    });
  }

  // Stop queued work when the caller disappears. Once a permit is granted the
  // exact transaction must run to a definitive commit/rollback; canceling a
  // Stripe mutation halfway through would make its provider outcome ambiguous.
  const queueAbort = new AbortController();
  const abortQueuedRequest = () => queueAbort.abort();
  req.once("aborted", abortQueuedRequest);
  res.once("close", abortQueuedRequest);
  if (req.aborted) queueAbort.abort();

  let billingPermit: FairKeyedConcurrencyPermit;
  try {
    billingPermit = await extraAgentBillingGate.acquire({
      key: req.user.id,
      signal: queueAbort.signal,
    });
  } catch (error) {
    if (error instanceof FairKeyedConcurrencyGateAdmissionError) {
      if (error.reason === "aborted") return;
      return billingBusyResponse(res);
    }
    throw error;
  } finally {
    req.off("aborted", abortQueuedRequest);
    res.off("close", abortQueuedRequest);
  }

  try {
    if (queueAbort.signal.aborted) return;
    const outcome = await drizzle.transaction(async (tx): Promise<RouteOutcome> => {
      // Bound both advisory-lock acquisition and any row-lock wait. Only the
      // exact 55P03 lock-timeout shape maps to BILLING_BUSY below; connection,
      // statement, serialization, and provider failures retain their existing
      // error posture.
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await acquireAccountDeletionFence(tx, req.user.id);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);

      const [deletion] = await tx
        .select({ id: schema.deletionQueue.id })
        .from(schema.deletionQueue)
        .where(
          and(
            eq(schema.deletionQueue.userId, req.user.id),
            inArray(schema.deletionQueue.status, ["pending", "purging"]),
          ),
        )
        .limit(1);

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
              error: "Billing is temporarily unavailable, so Bot-capacity changes are paused.",
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

      if (deletion && isIncrease) {
        return {
          status: 409,
          body: {
            code: "ACCOUNT_DELETION_PENDING",
            error: "Cancel the pending account deletion before purchasing more Bot capacity.",
          },
        };
      }

      // Release control blocks only provider-authoritative increases. Existing
      // customers can still decrease, cancel, and reconcile while launch is closed.
      if (isIncrease && !selfServeBillingEnabled()) {
        return {
          status: SELF_SERVE_BILLING_BLOCK.status,
          body: selfServeBillingBlockResponse(),
        };
      }

      // Launch blockers stop only a Stripe-authoritative increase. Do not gate
      // on `target > currentDbQuantity && isLaunchHardBlocked()`: a stale low
      // local count must never trap a customer in a higher provider quantity.
      if (isIncrease && isLaunchHardBlocked()) {
        return {
          status: 503,
          body: launchBlockResponse(),
        };
      }

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
              error: `Extra-agent pricing for ${plan.name} is not in the current BotBound catalog.`,
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
            error: "Billing could not update Bot capacity. No local entitlement was changed.",
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
              "Billing did not confirm the requested capacity. No local entitlement was changed.",
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
    if (isPostgresLockTimeout(error)) return billingBusyResponse(res);
    if (error instanceof AppError) throw error;
    log.error("Atomic Extra Agent billing route failed", {
      userId: req.user.id,
      target,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(500, "Failed to update extra agents");
  } finally {
    billingPermit.release();
  }
});

export default router;
