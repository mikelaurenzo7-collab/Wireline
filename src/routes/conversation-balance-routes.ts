import express, { Response } from "express";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { BOTBOUND_BRAND_NAME } from "../lib/brand";
import { auditLogger, drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { checkoutOperations } from "../db/security-schema";
import { authenticateUser } from "../middleware/auth";
import { fencePayableBillingDuringAccountDeletion } from "../middleware/account-deletion-billing-fence";
import {
  isMissingStripeResource,
  stripe,
  stripeAvailable,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
} from "../lib/stripe-helpers";
import { getCreditBalanceUsd, getRecentLedger } from "../lib/credit-wallet";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_MAX_USD,
  CONVERSATION_BALANCE_MIN_USD,
  CONVERSATION_BALANCE_PRESETS_USD,
  isConversationBalanceAmount,
} from "../lib/conversation-balance";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import { planById } from "../lib/plan-catalog";
import { resolveOwnedStripeCustomer } from "../lib/stripe-customer-binding";
import { fulfillStripeCheckoutSession } from "../lib/stripe-checkout-fulfillment";
import {
  RUNTIME_BALANCE_OPERATION_PREFIX,
  transitionRuntimeBalanceOperation,
  type RuntimeBalanceOperationStatus,
} from "../lib/runtime-balance-operation";

const router = express.Router();
const CHECKOUT_TTL_MS = 24 * 60 * 60_000;
const STRIPE_CHECKOUT_EXPIRY_MARGIN_MS = 60 * 60_000;
const ACTIVE_OPERATION_STATES = ["creating", "open"];
// Migration 0120 constrains this legacy column to month/year. Runtime Balance
// is distinguished by its reserved plan-id namespace; "month" is an inert
// compatibility sentinel, matching the existing live-video operation pattern.
const RUNTIME_BALANCE_OPERATION_INTERVAL = "month";

function runtimeBalanceOperationPlanId(amountCents: number): string {
  return `${RUNTIME_BALANCE_OPERATION_PREFIX}${amountCents}`;
}

function isRuntimeBalanceOperation(planId: string | null | undefined): boolean {
  return Boolean(planId?.startsWith(RUNTIME_BALANCE_OPERATION_PREFIX));
}

function isOwnedRuntimeBalanceSession(
  session: Stripe.Checkout.Session,
  userId: string,
  operationId: string,
): boolean {
  return (
    session.mode === "payment" &&
    session.metadata?.purpose === "credit_topup" &&
    session.metadata?.wireline_user_id === userId &&
    session.metadata?.wireline_checkout_operation_id === operationId
  );
}

async function markRuntimeBalanceOperation(
  id: string,
  userId: string,
  allowedFrom: readonly RuntimeBalanceOperationStatus[],
  values: {
    status: "creating" | "open" | "completed" | "failed" | "expired";
    stripeCustomerId?: string | null;
    stripeCheckoutSessionId?: string | null;
    checkoutUrl?: string | null;
    failureCode?: string | null;
  },
): Promise<boolean> {
  return transitionRuntimeBalanceOperation({ id, userId, allowedFrom, values });
}

async function failRuntimeBalanceOperation(
  id: string,
  userId: string,
  values: { stripeCustomerId?: string | null; failureCode?: string | null },
): Promise<boolean> {
  // A concurrent retry can resolve the same operation to open. Never let a
  // late deterministic failure overwrite that payable session and free the
  // partial-unique slot for a duplicate Checkout.
  return transitionRuntimeBalanceOperation({
    id,
    userId,
    allowedFrom: ["creating"],
    values: { status: "failed", ...values },
  });
}

function runtimeBalanceOperationChanged(res: Response, operationId: string): Response {
  return res.status(409).json({
    code: "RUNTIME_BALANCE_OPERATION_CHANGED",
    error: "This Runtime Balance checkout changed while the request was running. Refresh billing.",
    operation_id: operationId,
  });
}

async function ensureRuntimeBalanceCustomer(
  userId: string,
  email: string,
  existingCustomerId: string | null,
): Promise<{ id: string; recovered: boolean }> {
  if (existingCustomerId) {
    const reusable = await resolveOwnedStripeCustomer({
      customerId: existingCustomerId,
      userId,
      authenticatedEmail: email,
    });
    if (reusable) return { id: reusable.id, recovered: false };
  }

  // A lost response must resolve to the same customer. Include the stale id in
  // recovery keys so replacing one deleted/foreign projection never collides
  // with a later, independently stale projection.
  const recoveryScope = existingCustomerId
    ? createHash("sha256").update(existingCustomerId).digest("hex").slice(0, 32)
    : null;
  const idempotencyKey = recoveryScope
    ? `wireline-runtime-balance-customer-recovery-${userId}-${recoveryScope}`
    : `wireline-runtime-balance-customer-${userId}`;
  const customer = await stripe.customers.create(
    {
      email,
      metadata: { wireline_user_id: userId },
    },
    { idempotencyKey },
  );
  return { id: customer.id, recovered: Boolean(existingCustomerId) };
}

function isAmbiguousStripeError(error: unknown): boolean {
  const candidate = error as { type?: unknown; statusCode?: unknown };
  const type = typeof candidate?.type === "string" ? candidate.type : "";
  const statusCode =
    typeof candidate?.statusCode === "number" && Number.isFinite(candidate.statusCode)
      ? candidate.statusCode
      : null;
  if (type === "StripeConnectionError") return true;
  if (type === "StripeIdempotencyError" || statusCode === 409) return true;
  if (statusCode === null) return true;
  return statusCode === 429 || statusCode >= 500;
}

router.get(
  "/api/conversation-balance",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [balanceUsd, ledger] = await Promise.all([
        getCreditBalanceUsd(req.user.id),
        getRecentLedger(req.user.id, 20),
      ]);

      res.json({
        balance_usd: Number(balanceUsd.toFixed(2)),
        presets_usd: [...CONVERSATION_BALANCE_PRESETS_USD],
        min_usd: CONVERSATION_BALANCE_MIN_USD,
        max_usd: CONVERSATION_BALANCE_MAX_USD,
        copy: CONVERSATION_BALANCE_COPY,
        ledger,
        stripe_configured: stripeAvailable(),
      });
    } catch (err) {
      rethrowIfAppError(err);
      log.error("conversation balance read failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, `Could not load ${CONVERSATION_BALANCE_COPY.title}.`);
    }
  },
);

router.post(
  "/api/conversation-balance/checkout",
  authenticateUser,
  enforceLaunchHardGate,
  fencePayableBillingDuringAccountDeletion,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!stripeAvailable()) {
        throw AppError.fromHttpStatus(503, "Billing is temporarily unavailable.");
      }

      const amountUsd = Number(req.body?.amount_usd);
      if (!isConversationBalanceAmount(amountUsd)) {
        return res.status(400).json({
          code: "INVALID_AMOUNT",
          error: `Choose a whole-dollar amount between $${CONVERSATION_BALANCE_MIN_USD} and $${CONVERSATION_BALANCE_MAX_USD}.`,
        });
      }

      const [subscription] = await drizzle
        .select({
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);

      const plan = planById(subscription?.plan);
      const activePaidPlan =
        !!plan &&
        plan.id !== "personal" &&
        ["active", "trialing"].includes(subscription?.status || "");
      if (!activePaidPlan) {
        return res.status(402).json({
          code: "LIVE_PLAN_REQUIRED",
          error:
            "Choose Starter, Starter Plus, or Pro before adding Runtime Balance. Paid plans include live-call minutes first.",
          recovery_path: "/settings/billing",
        });
      }

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res.status(503).json({
          code: "APP_URL_NOT_CONFIGURED",
          error: "Billing is unavailable because APP_URL is not configured.",
        });
      }

      const amountCents = Math.round(amountUsd * 100);
      const operationPlanId = runtimeBalanceOperationPlanId(amountCents);

      // Only reconcile this flow's expired operation. Plan and live-video
      // Checkouts share the active-user mutex and own their own Stripe-side
      // expiry/recovery. An open local record is never freed without proving
      // the remote Session terminal (or expiring it at Stripe first).
      const [expiredOperation] = await drizzle
        .select({
          id: checkoutOperations.id,
          status: checkoutOperations.status,
          stripeCheckoutSessionId: checkoutOperations.stripeCheckoutSessionId,
        })
        .from(checkoutOperations)
        .where(
          and(
            eq(checkoutOperations.userId, req.user.id),
            inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES),
            sql`left(${checkoutOperations.planId}, ${RUNTIME_BALANCE_OPERATION_PREFIX.length}) = ${RUNTIME_BALANCE_OPERATION_PREFIX}`,
            sql`${checkoutOperations.expiresAt} < clock_timestamp()`,
          ),
        )
        .limit(1);

      if (expiredOperation?.status === "open") {
        if (!expiredOperation.stripeCheckoutSessionId) {
          return res.status(409).json({
            code: "CHECKOUT_STATE_UNCLEAR",
            error: "A previous Runtime Balance checkout needs reconciliation before retrying.",
            operation_id: expiredOperation.id,
          });
        }

        let expiredRemoteSession: Stripe.Checkout.Session | null = null;
        try {
          expiredRemoteSession = await stripe.checkout.sessions.retrieve(
            expiredOperation.stripeCheckoutSessionId,
          );
        } catch (error) {
          if (!isMissingStripeResource(error)) throw error;
        }

        if (
          expiredRemoteSession &&
          !isOwnedRuntimeBalanceSession(expiredRemoteSession, req.user.id, expiredOperation.id)
        ) {
          log.error("Runtime Balance operation points to an unowned Stripe Checkout Session", {
            operationId: expiredOperation.id,
            sessionId: expiredRemoteSession.id,
            userId: req.user.id,
          });
          return res.status(409).json({
            code: "CHECKOUT_STATE_UNCLEAR",
            error: "A previous Runtime Balance checkout needs reconciliation before retrying.",
            operation_id: expiredOperation.id,
          });
        }

        if (expiredRemoteSession?.status === "open") {
          try {
            await stripe.checkout.sessions.expire(expiredOperation.stripeCheckoutSessionId);
          } catch {
            return res.status(409).json({
              code: "CHECKOUT_ALREADY_IN_PROGRESS",
              error: "A Runtime Balance checkout may still be payable. Try again shortly.",
              operation_id: expiredOperation.id,
            });
          }
        } else if (expiredRemoteSession?.status === "complete") {
          const fulfillment = await fulfillStripeCheckoutSession(expiredRemoteSession);
          if (!fulfillment.paymentSettled) {
            return res.status(409).json({
              code: "RUNTIME_BALANCE_PAYMENT_PROCESSING",
              error: "Your previous Runtime Balance payment is still processing.",
              operation_id: expiredOperation.id,
            });
          }
          return res.status(409).json({
            code: "RUNTIME_BALANCE_CHECKOUT_COMPLETED",
            error: "Your previous Runtime Balance purchase is complete. Refresh your balance.",
            operation_id: expiredOperation.id,
          });
        }

        const expired = await markRuntimeBalanceOperation(
          expiredOperation.id,
          req.user.id,
          ["open"],
          {
            status: "expired",
            failureCode: null,
          },
        );
        if (!expired) return runtimeBalanceOperationChanged(res, expiredOperation.id);
      } else if (expiredOperation?.status === "creating") {
        // Checkout receives a provider expiry one hour before this local lease.
        // Even an unknown-response create can no longer be payable here.
        const expired = await markRuntimeBalanceOperation(
          expiredOperation.id,
          req.user.id,
          ["creating"],
          {
            status: "expired",
            failureCode: null,
          },
        );
        if (!expired) return runtimeBalanceOperationChanged(res, expiredOperation.id);
      }

      const createdOperationExpiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
      const [createdOperation] = await drizzle
        .insert(checkoutOperations)
        .values({
          userId: req.user.id,
          planId: operationPlanId,
          billingInterval: RUNTIME_BALANCE_OPERATION_INTERVAL,
          status: "creating",
          expiresAt: createdOperationExpiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: checkoutOperations.id });

      let operationId = createdOperation?.id || null;
      let operationExpiresAt = createdOperationExpiresAt;
      let operationCustomerId: string | null = null;
      let resumed = false;

      if (!operationId) {
        const [active] = await drizzle
          .select({
            id: checkoutOperations.id,
            planId: checkoutOperations.planId,
            billingInterval: checkoutOperations.billingInterval,
            status: checkoutOperations.status,
            stripeCustomerId: checkoutOperations.stripeCustomerId,
            stripeCheckoutSessionId: checkoutOperations.stripeCheckoutSessionId,
            checkoutUrl: checkoutOperations.checkoutUrl,
            expiresAt: checkoutOperations.expiresAt,
          })
          .from(checkoutOperations)
          .where(
            and(
              eq(checkoutOperations.userId, req.user.id),
              inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES),
            ),
          )
          .limit(1);

        const sameAmount =
          active?.planId === operationPlanId &&
          active?.billingInterval === RUNTIME_BALANCE_OPERATION_INTERVAL;
        const sameFlow = isRuntimeBalanceOperation(active?.planId);

        if (!active || !sameFlow) {
          return res.status(409).json({
            code: "CHECKOUT_ALREADY_IN_PROGRESS",
            error: "Another checkout is already in progress. Complete or cancel it first.",
            operation_id: active?.id,
          });
        }

        if (active.status === "open") {
          if (!active.stripeCheckoutSessionId) {
            return res.status(409).json({
              code: "CHECKOUT_STATE_UNCLEAR",
              error: "A previous Runtime Balance checkout needs reconciliation before retrying.",
              operation_id: active.id,
            });
          }

          let remoteSession: Stripe.Checkout.Session | null = null;
          try {
            remoteSession = await stripe.checkout.sessions.retrieve(active.stripeCheckoutSessionId);
          } catch (error) {
            if (!isMissingStripeResource(error)) throw error;
          }

          if (
            remoteSession &&
            !isOwnedRuntimeBalanceSession(remoteSession, req.user.id, active.id)
          ) {
            log.error("Runtime Balance operation points to an unowned Stripe Checkout Session", {
              operationId: active.id,
              sessionId: remoteSession.id,
              userId: req.user.id,
            });
            return res.status(409).json({
              code: "CHECKOUT_STATE_UNCLEAR",
              error: "A previous Runtime Balance checkout needs reconciliation before retrying.",
              operation_id: active.id,
            });
          }

          if (sameAmount && remoteSession?.status === "open" && remoteSession.url) {
            if (remoteSession.url !== active.checkoutUrl) {
              const refreshed = await markRuntimeBalanceOperation(
                active.id,
                req.user.id,
                ["open"],
                {
                  status: "open",
                  stripeCustomerId: active.stripeCustomerId,
                  stripeCheckoutSessionId: remoteSession.id,
                  checkoutUrl: remoteSession.url,
                  failureCode: null,
                },
              );
              if (!refreshed) return runtimeBalanceOperationChanged(res, active.id);
            }
            return res.json({ url: remoteSession.url, reused: true, operation_id: active.id });
          }

          if (remoteSession?.status === "complete") {
            const fulfillment = await fulfillStripeCheckoutSession(remoteSession);
            if (!fulfillment.paymentSettled) {
              return res.status(409).json({
                code: "RUNTIME_BALANCE_PAYMENT_PROCESSING",
                error: "Your previous Runtime Balance payment is still processing.",
                operation_id: active.id,
              });
            }
            return res.status(409).json({
              code: "RUNTIME_BALANCE_CHECKOUT_COMPLETED",
              error: "Your previous Runtime Balance purchase is complete. Refresh your balance.",
              operation_id: active.id,
            });
          }

          if (remoteSession?.status === "open" && active.stripeCheckoutSessionId) {
            // A different top-up amount supersedes only another Runtime Balance
            // Checkout. Expire at Stripe first so the old URL cannot be paid
            // after its replacement becomes available.
            try {
              await stripe.checkout.sessions.expire(active.stripeCheckoutSessionId);
            } catch {
              return res.status(409).json({
                code: "CHECKOUT_ALREADY_IN_PROGRESS",
                error: "A Runtime Balance checkout is already open. Complete or cancel it first.",
                operation_id: active.id,
              });
            }
          }

          const expired = await markRuntimeBalanceOperation(active.id, req.user.id, ["open"], {
            // The completed branch above always returns after settlement
            // reconciliation, so every state reaching here is terminally
            // expired (or missing) and safe to replace.
            status: "expired",
            failureCode: null,
          });
          if (!expired) return runtimeBalanceOperationChanged(res, active.id);
          const renewedExpiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
          const [renewed] = await drizzle
            .insert(checkoutOperations)
            .values({
              userId: req.user.id,
              planId: operationPlanId,
              billingInterval: RUNTIME_BALANCE_OPERATION_INTERVAL,
              status: "creating",
              expiresAt: renewedExpiresAt,
            })
            .onConflictDoNothing()
            .returning({ id: checkoutOperations.id });
          operationId = renewed?.id || null;
          operationExpiresAt = renewedExpiresAt;
          if (!operationId) {
            return res.status(409).json({
              code: "CHECKOUT_ALREADY_IN_PROGRESS",
              error: "Another checkout request is being prepared. Try again in a moment.",
            });
          }
        } else if (active.status === "creating" && sameAmount) {
          operationId = active.id;
          operationExpiresAt = active.expiresAt;
          operationCustomerId = active.stripeCustomerId || null;
          resumed = true;
        } else {
          return res.status(409).json({
            code: "CHECKOUT_ALREADY_IN_PROGRESS",
            error: "A Runtime Balance checkout is already being prepared. Try again shortly.",
            operation_id: active.id,
          });
        }
      }

      if (!operationId) {
        return res.status(409).json({
          code: "CHECKOUT_ALREADY_IN_PROGRESS",
          error: "Another checkout request is being prepared. Try again in a moment.",
        });
      }

      const creditMeta = {
        wireline_user_id: req.user.id,
        wireline_checkout_operation_id: operationId,
        wireline_plan: plan.id,
        purpose: "credit_topup",
        credit_usd: String(amountUsd),
        overage_policy: "prepaid_balance_only",
      };

      let customerId: string | null = null;
      let customerResolved = false;
      let checkoutAttempted = false;
      let checkoutResolved = false;
      let resolvedSession: Stripe.Checkout.Session | null = null;
      let createdSession: { id: string; url: string } | null = null;

      try {
        const ensuredCustomer = await ensureRuntimeBalanceCustomer(
          req.user.id,
          req.user.email,
          operationCustomerId || subscription?.stripeCustomerId || null,
        );
        customerId = ensuredCustomer.id;
        customerResolved = true;

        // The durable operation is the recovery source if the subscription
        // projection write fails after Stripe has resolved the customer.
        const customerPersisted = await markRuntimeBalanceOperation(
          operationId,
          req.user.id,
          ["creating"],
          {
            status: "creating",
            stripeCustomerId: customerId,
            failureCode: null,
          },
        );
        if (!customerPersisted) return runtimeBalanceOperationChanged(res, operationId);
        await drizzle
          .update(schema.subscriptions)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(schema.subscriptions.userId, req.user.id));

        if (ensuredCustomer.recovered) {
          log.warn("Recovered Runtime Balance checkout from a stale Stripe customer reference", {
            userId: req.user.id,
            operationId,
            customerId,
          });
        }

        checkoutAttempted = true;
        const session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            integration_identifier: stripeCheckoutIntegrationIdentifier(
              "runtime_balance",
              operationId,
            ),
            customer: customerId,
            customer_update: { address: "auto" },
            // Tie Stripe's payable lifetime to the durable operation. The
            // local TTL sweep can then never free a second Checkout while an
            // unknown-response session from this operation remains payable.
            expires_at: Math.floor(
              (operationExpiresAt.getTime() - STRIPE_CHECKOUT_EXPIRY_MARGIN_MS) / 1000,
            ),
            ...stripeCheckoutTaxConfig(),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: amountCents,
                  product_data: {
                    name: `${BOTBOUND_BRAND_NAME} Runtime Balance`,
                    description: `$${amountUsd} prepaid Runtime Balance for extra calls, texts, and live work`,
                  },
                },
              },
            ],
            success_url: `${appUrl.url}/settings/billing?balance=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl.url}/settings/billing?balance=canceled`,
            client_reference_id: req.user.id,
            payment_intent_data: { metadata: creditMeta },
            metadata: creditMeta,
          },
          { idempotencyKey: `wireline-runtime-balance-checkout-${operationId}` },
        );
        checkoutResolved = true;
        resolvedSession = session;

        // Stripe can replay a terminal Session for this idempotency key after
        // the original HTTP response was lost. Never relabel it open or hand
        // the customer a consumed URL.
        if (session.status === "complete") {
          const fulfillment = await fulfillStripeCheckoutSession(session);
          if (!fulfillment.paymentSettled) {
            const processingPersisted = await markRuntimeBalanceOperation(
              operationId,
              req.user.id,
              ["creating", "open"],
              {
                status: "open",
                stripeCustomerId: customerId,
                stripeCheckoutSessionId: session.id,
                checkoutUrl: session.url,
                failureCode: "stripe_payment_processing",
              },
            );
            if (!processingPersisted) {
              return runtimeBalanceOperationChanged(res, operationId);
            }
            return res.status(409).json({
              code: "RUNTIME_BALANCE_PAYMENT_PROCESSING",
              error: "Your Runtime Balance payment is still processing.",
              operation_id: operationId,
            });
          }
          return res.status(409).json({
            code: "RUNTIME_BALANCE_CHECKOUT_COMPLETED",
            error: "Your Runtime Balance purchase is complete. Refresh your balance.",
            operation_id: operationId,
          });
        }

        if (session.status !== "open") {
          const terminalPersisted = await markRuntimeBalanceOperation(
            operationId,
            req.user.id,
            ["creating", "open"],
            {
              status: "expired",
              stripeCustomerId: customerId,
              stripeCheckoutSessionId: session.id,
              checkoutUrl: session.url,
              failureCode: "stripe_checkout_not_open",
            },
          );
          if (!terminalPersisted) return runtimeBalanceOperationChanged(res, operationId);
          return res.status(409).json({
            code: "RUNTIME_BALANCE_CHECKOUT_EXPIRED",
            error: "Your previous Runtime Balance checkout expired. Try again.",
            operation_id: operationId,
          });
        }

        if (!session.url) throw new Error("Stripe Checkout returned no hosted URL");
        createdSession = { id: session.id, url: session.url };

        const opened = await markRuntimeBalanceOperation(
          operationId,
          req.user.id,
          ["creating", "open"],
          {
            status: "open",
            stripeCustomerId: customerId,
            stripeCheckoutSessionId: createdSession.id,
            checkoutUrl: createdSession.url,
            failureCode: null,
          },
        );
        if (!opened) {
          // A terminal state won the compare-and-set while Stripe was creating
          // the Session. Revoke any still-payable URL before returning.
          await stripe.checkout.sessions.expire(createdSession.id).catch((expireError) => {
            log.warn("Runtime Balance stale Checkout could not be expired", {
              operationId,
              sessionId: createdSession?.id,
              userId: req.user.id,
              error: getErrorMessage(expireError),
            });
          });
          return runtimeBalanceOperationChanged(res, operationId);
        }

        res.json({
          url: createdSession.url,
          operation_id: operationId,
          ...(resumed ? { resumed: true } : {}),
        });
        void auditLogger
          .logBilling("checkout_started", {
            userId: req.user.id,
            customerId,
            amountCents,
            ip: req.ip,
            metadata: {
              product: "conversation_balance",
              plan: plan.id,
              operation_id: operationId,
              resumed,
            },
          })
          .catch((err) =>
            log.warn("conversation balance checkout audit failed", {
              error: getErrorMessage(err),
            }),
          );
      } catch (error) {
        if (resolvedSession?.status === "complete") {
          await markRuntimeBalanceOperation(operationId, req.user.id, ["creating", "open"], {
            status: "open",
            stripeCustomerId: customerId,
            stripeCheckoutSessionId: resolvedSession.id,
            checkoutUrl: resolvedSession.url,
            failureCode: "settlement_reconciliation_failed",
          }).catch(() => false);
          throw error;
        }

        if (createdSession) {
          const recovered = await markRuntimeBalanceOperation(
            operationId,
            req.user.id,
            ["creating", "open"],
            {
              status: "open",
              stripeCustomerId: customerId,
              stripeCheckoutSessionId: createdSession.id,
              checkoutUrl: createdSession.url,
              failureCode: "post_stripe_persistence_failed",
            },
          ).catch(() => null);
          if (recovered === false) return runtimeBalanceOperationChanged(res, operationId);
          log.error("Runtime Balance Checkout exists but operation persistence failed", {
            operationId,
            sessionId: createdSession.id,
            userId: req.user.id,
            error: getErrorMessage(error),
          });
          return res.json({
            url: createdSession.url,
            operation_id: operationId,
            warning: "Checkout is ready; BotBound is reconciling its local billing record.",
          });
        }

        if (customerResolved && !checkoutAttempted) {
          await markRuntimeBalanceOperation(operationId, req.user.id, ["creating"], {
            status: "creating",
            stripeCustomerId: customerId,
            failureCode: "customer_state_persistence_failed",
          }).catch(() => false);
        } else if (checkoutAttempted && !checkoutResolved && isAmbiguousStripeError(error)) {
          await markRuntimeBalanceOperation(operationId, req.user.id, ["creating"], {
            status: "creating",
            stripeCustomerId: customerId,
            failureCode: "stripe_checkout_outcome_unknown",
          }).catch(() => false);
        } else {
          await failRuntimeBalanceOperation(operationId, req.user.id, {
            stripeCustomerId: customerId,
            failureCode: "stripe_checkout_failed",
          }).catch(() => false);
        }
        throw error;
      }
    } catch (err) {
      rethrowIfAppError(err);
      log.error("conversation balance checkout failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(
        500,
        `Could not start ${CONVERSATION_BALANCE_COPY.title} checkout.`,
      );
    }
  },
);

export default router;
