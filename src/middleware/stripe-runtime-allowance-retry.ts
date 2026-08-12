import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";

import { AppError } from "../lib/api-error";
import { addCredit, reverseCredit } from "../lib/credit-wallet";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";
import {
  stripe,
  stripeAvailable,
  subscriptionBillingInterval,
  basePlanInvoiceShare,
  stripeInvoiceIdForCharge,
} from "../lib/stripe-helpers";
import { basePlanFromStripeSubscription } from "../lib/stripe-base-plan";
import {
  reverseSubscriptionRuntimeAllowance,
  runtimeAllowanceUsdForPlan,
  type SubscriptionBillingInterval,
} from "../lib/subscription-welcome-credit";
import {
  disputeBalanceMovementCents,
  proportionalTopUpCreditUsd,
  runtimeAllowanceMovementUsd,
  subscriptionDisputeAllowancePortion,
} from "../lib/stripe-dispute-accounting";

/**
 * Stripe can omit the expanded `charge.refunds` list from webhook payloads.
 * Always list the authoritative refund objects so every partial refund is
 * reversed under its own stable id. Replaying the event is safe because the
 * credit ledger is idempotent on `(user, ref_type, ref_id)`.
 */
async function listSucceededRefunds(chargeId: string): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(
      ...page.data.filter(
        (refund) => (!refund.status || refund.status === "succeeded") && refund.amount > 0,
      ),
    );
    hasMore = page.has_more;
    if (!hasMore) break;
    const last = page.data.at(-1);
    if (!last) throw new Error("Stripe refund pagination returned has_more without a cursor.");
    startingAfter = last.id;
  }

  return refunds;
}

type SubscriptionAllowanceContext = {
  userId: string;
  planId: string;
  interval: SubscriptionBillingInterval;
  allowanceShare: number;
  chargeCents: number;
};

/**
 * Resolve the subscription-funded portion of a charge from the historical
 * Stripe objects that actually funded it.
 *
 * A dispute can arrive months after cancellation and resubscription, so the
 * tenant's current subscription row may hold a different subscription id and
 * plan. Prefer the exact historical subscription id, fall back to the stable
 * Stripe customer id for tenant ownership, and always derive the allowance plan
 * and interval from the disputed subscription itself.
 */
async function resolveSubscriptionAllowanceContext(
  charge: Stripe.Charge,
  operation: "refund" | "dispute_withdrawal" | "dispute_reinstatement",
): Promise<SubscriptionAllowanceContext | null> {
  const invoiceId = await stripeInvoiceIdForCharge(charge);
  if (!invoiceId) {
    log.info("subscription allowance operation skipped: charge has no invoice", {
      chargeId: charge.id,
      operation,
    });
    return null;
  }

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionField = (invoice as Stripe.Invoice & { subscription?: string | { id: string } })
    .subscription;
  const subscriptionId =
    typeof subscriptionField === "string" ? subscriptionField : subscriptionField?.id;
  if (!subscriptionId) {
    log.info("subscription allowance operation skipped: invoice has no subscription", {
      chargeId: charge.id,
      invoiceId,
      operation,
    });
    return null;
  }

  const allowanceShare = basePlanInvoiceShare(invoice);
  if (allowanceShare === null) {
    log.info("subscription allowance operation skipped: invoice funded no base plan", {
      chargeId: charge.id,
      invoiceId,
      subscriptionId,
      operation,
    });
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const disputedPlan = basePlanFromStripeSubscription(subscription);
  if (!disputedPlan) {
    throw new Error(
      `Stripe subscription ${subscriptionId} funded Runtime Allowance but its historical plan is not mapped.`,
    );
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const [bySubscription] = await drizzle
    .select({ userId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);
  let owner = bySubscription;
  if (!owner?.userId && customerId) {
    const [byCustomer] = await drizzle
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeCustomerId, customerId))
      .limit(1);
    owner = byCustomer;
  }
  if (!owner?.userId) {
    throw new Error(
      `Stripe subscription ${subscriptionId} funded Runtime Allowance but its Wireline owner is unresolved.`,
    );
  }

  return {
    userId: owner.userId,
    planId: disputedPlan.id,
    interval: subscriptionBillingInterval(subscription),
    allowanceShare,
    chargeCents: charge.amount || 0,
  };
}

async function ledgerMovementAmountUsd(
  userId: string,
  refType: string,
  refId: string,
): Promise<number | null> {
  const [row] = await drizzle
    .select({ deltaUsd: schema.creditLedger.deltaUsd })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, refType),
        eq(schema.creditLedger.refId, refId),
      ),
    )
    .limit(1);
  if (row?.deltaUsd == null) return null;
  const amount = Math.abs(Number(row.deltaUsd));
  return Number.isFinite(amount) ? amount : null;
}

async function retrieveAuthoritativeDispute(disputeId: string): Promise<Stripe.Dispute> {
  return stripe.disputes.retrieve(disputeId, {
    expand: ["balance_transactions"],
  });
}

function disputeMovementCents(
  dispute: Stripe.Dispute,
  direction: "withdrawn" | "reinstated",
): number {
  const transactions = (dispute.balance_transactions ?? []).filter(
    (transaction): transaction is Stripe.BalanceTransaction =>
      !!transaction && typeof transaction !== "string",
  );
  return disputeBalanceMovementCents({
    disputeAmountCents: dispute.amount,
    disputeCurrency: dispute.currency,
    balanceTransactions: transactions,
    direction,
  });
}

async function resolvePaymentIntent(
  dispute: Stripe.Dispute,
  charge: Stripe.Charge,
): Promise<Stripe.PaymentIntent | null> {
  const field = dispute.payment_intent ?? charge.payment_intent;
  const id = typeof field === "string" ? field : field?.id;
  return id ? stripe.paymentIntents.retrieve(id) : null;
}

/** Strict subscription Runtime Allowance reversal for refunds and withdrawals. */
export async function reverseSubscriptionRuntimeAllowanceForChargeStrict(
  charge: Stripe.Charge,
  reason: "refund" | "dispute",
  explicitReference?: string,
  movementAmountCents?: number,
  providerEventId?: string,
): Promise<boolean> {
  const operation = reason === "refund" ? "refund" : "dispute_withdrawal";
  const context = await resolveSubscriptionAllowanceContext(charge, operation);
  if (!context) return false;

  if (reason === "dispute") {
    const reference = explicitReference || charge.id;
    const portion = subscriptionDisputeAllowancePortion(
      movementAmountCents ?? 0,
      context.chargeCents,
      context.allowanceShare,
    );
    if (!(portion > 0)) return false;
    await tenantStore.run(context.userId, () =>
      reverseSubscriptionRuntimeAllowance(
        context.userId,
        reference,
        context.planId,
        context.interval,
        "dispute",
        portion,
        { providerEventId, providerObjectId: reference },
      ),
    );
    return true;
  }

  if ((charge.amount_refunded || 0) <= 0) return false;
  const refunds = await listSucceededRefunds(charge.id);
  if (refunds.length === 0) {
    throw new Error(
      `Stripe charge ${charge.id} reports refunded funds but no succeeded refund objects.`,
    );
  }

  await tenantStore.run(context.userId, async () => {
    for (const refund of refunds) {
      const portion = subscriptionDisputeAllowancePortion(
        refund.amount,
        context.chargeCents,
        context.allowanceShare,
      );
      await reverseSubscriptionRuntimeAllowance(
        context.userId,
        refund.id,
        context.planId,
        context.interval,
        "refund",
        portion,
        { providerEventId, providerObjectId: refund.id },
      );
    }
  });
  return true;
}

async function reverseTopUpDisputeStrict(
  paymentIntent: Stripe.PaymentIntent,
  dispute: Stripe.Dispute,
  withdrawnCents: number,
  providerEventId: string,
): Promise<boolean> {
  const userId = String(paymentIntent.metadata?.wireline_user_id || "").trim();
  const purchasedCreditUsd = Number(paymentIntent.metadata?.credit_usd);
  if (!userId || !(purchasedCreditUsd > 0)) {
    throw new Error(
      `Stripe top-up dispute ${dispute.id} is missing Wireline owner or purchased-credit metadata.`,
    );
  }

  const amountUsd = proportionalTopUpCreditUsd(
    withdrawnCents,
    paymentIntent.amount || 0,
    purchasedCreditUsd,
  );
  if (!(amountUsd > 0)) return false;

  await tenantStore.run(userId, () =>
    reverseCredit(userId, amountUsd, "web_topup_dispute", {
      type: "stripe_dispute",
      id: dispute.id,
      entryKind: "reversal",
      source: "stripe",
      provider: "stripe",
      providerEventId,
      providerObjectId: dispute.id,
      customerReason: "Runtime Balance dispute reversal",
      metadata: {
        payment_intent_id: paymentIntent.id,
        stripe_withdrawn_cents: withdrawnCents,
      },
    }),
  );
  return true;
}

async function restoreSubscriptionRuntimeAllowanceForDisputeStrict(
  charge: Stripe.Charge,
  dispute: Stripe.Dispute,
  reinstatedCents: number,
  providerEventId: string,
): Promise<boolean> {
  const context = await resolveSubscriptionAllowanceContext(charge, "dispute_reinstatement");
  if (!context) return false;

  const portion = subscriptionDisputeAllowancePortion(
    reinstatedCents,
    context.chargeCents,
    context.allowanceShare,
  );
  const calculatedAmountUsd = runtimeAllowanceMovementUsd(
    runtimeAllowanceUsdForPlan(context.planId, context.interval),
    portion,
  );
  if (!(calculatedAmountUsd > 0)) return false;

  await tenantStore.run(context.userId, async () => {
    const reversedAmountUsd = await ledgerMovementAmountUsd(
      context.userId,
      "subscription_runtime_allowance_reversal",
      dispute.id,
    );
    if (!(reversedAmountUsd && reversedAmountUsd > 0)) {
      throw new Error(
        `Stripe dispute ${dispute.id} reinstatement arrived before its subscription allowance withdrawal.`,
      );
    }
    const amountUsd = Math.min(calculatedAmountUsd, reversedAmountUsd);

    await addCredit(context.userId, amountUsd, "subscription_runtime_allowance_dispute_restored", {
      type: "subscription_runtime_allowance_dispute_restoration",
      id: dispute.id,
      entryKind: "adjustment",
      source: "stripe",
      provider: "stripe",
      providerEventId,
      providerObjectId: dispute.id,
      customerReason: "Runtime Allowance restored after dispute funds were reinstated",
      metadata: {
        plan_id: context.planId,
        billing_interval: context.interval,
        runtime_allowance_usd: amountUsd,
        restoration_portion: portion,
        stripe_reinstated_cents: reinstatedCents,
        dispute_status: dispute.status,
      },
    });
  });
  return true;
}

async function restoreTopUpDisputeStrict(
  paymentIntent: Stripe.PaymentIntent,
  dispute: Stripe.Dispute,
  reinstatedCents: number,
  providerEventId: string,
): Promise<boolean> {
  const userId = String(paymentIntent.metadata?.wireline_user_id || "").trim();
  const purchasedCreditUsd = Number(paymentIntent.metadata?.credit_usd);
  if (!userId || !(purchasedCreditUsd > 0)) {
    throw new Error(
      `Stripe top-up dispute ${dispute.id} is missing Wireline owner or purchased-credit metadata.`,
    );
  }

  const calculatedAmountUsd = proportionalTopUpCreditUsd(
    reinstatedCents,
    paymentIntent.amount || 0,
    purchasedCreditUsd,
  );
  if (!(calculatedAmountUsd > 0)) return false;

  await tenantStore.run(userId, async () => {
    const reversedAmountUsd = await ledgerMovementAmountUsd(userId, "stripe_dispute", dispute.id);
    if (!(reversedAmountUsd && reversedAmountUsd > 0)) {
      throw new Error(
        `Stripe dispute ${dispute.id} reinstatement arrived before its top-up withdrawal.`,
      );
    }
    const amountUsd = Math.min(calculatedAmountUsd, reversedAmountUsd);

    await addCredit(userId, amountUsd, "web_topup_dispute_restored", {
      type: "stripe_dispute_restoration",
      id: dispute.id,
      entryKind: "adjustment",
      source: "stripe",
      provider: "stripe",
      providerEventId,
      providerObjectId: dispute.id,
      customerReason: "Runtime Balance restored after dispute funds were reinstated",
      metadata: {
        payment_intent_id: paymentIntent.id,
        stripe_reinstated_cents: reinstatedCents,
        dispute_status: dispute.status,
        restored_usd: amountUsd,
      },
    });
  });
  return true;
}

async function claimOrRespondDuplicate(
  event: Stripe.Event,
  res: Response,
  next: NextFunction,
): Promise<"claimed" | "responded"> {
  const claimed = await claimStripeEventForPreflight(event);
  if (claimed === "already_processed") {
    res.json({ received: true, duplicate: true });
    return "responded";
  }
  if (claimed === "in_flight") {
    next(AppError.fromHttpStatus(503, "Webhook still processing. Retry."));
    return "responded";
  }
  return "claimed";
}

/**
 * Financial-integrity preflight for refunds and dispute balance movements.
 *
 * `charge.dispute.created` is notification-only: it can represent an inquiry
 * where no money moved. Wallet debits and credits follow Stripe's exact
 * `funds_withdrawn` and `funds_reinstated` events and their balance
 * transactions. The preflight owns these paths before the legacy billing
 * router and acknowledges them only after idempotent ledger mutations succeed.
 */
export async function stripeRuntimeAllowanceRetryPreflight(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "POST") return next();
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) return next();

  const signature = req.headers["stripe-signature"] as string | undefined;
  if (!signature || !Buffer.isBuffer(req.body)) return next();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return next();
  }

  try {
    /*
     * Both refund-lifecycle events land here. `charge.refunded` fires when the
     * refund is CREATED, which for an asynchronous refund is before any refund
     * object reads `succeeded` — the strict reversal below then throws, the
     * claim is released, and Stripe retries for ~3 days before giving up. If
     * the issuer takes longer than that to settle (5-10 days is ordinary for
     * some card refunds), the allowance is never reversed and the refunded
     * money stays spendable.
     *
     * `refund.updated` is the settle signal — NOT `charge.refund.updated`,
     * which Stripe documents for selected non-card payment methods. This
     * account accepts `card` and `link` only, and Stripe's own async-refund
     * test cards state that a pending card refund transitions to succeeded and
     * "sends a `refund.updated` event". Subscribing the wrong one would have
     * left the dead-end this exists to close wide open while looking fixed.
     * It MUST be owned here, not downstream: the legacy reverser in billing-routes falls back to keying on
     * charge.id when a Charge arrives without an expanded refunds list — which
     * is the default under the pinned API version — and that key is disjoint
     * from the refund.id key this path writes, so the (user, ref) unique index
     * would not dedupe them and the tenant would be debited twice for one
     * refund. Same claim, same strict per-refund.id reversal, both events.
     */
    if (event.type === "charge.refunded" || event.type === "refund.updated") {
      let charge: Stripe.Charge;
      if (event.type === "charge.refunded") {
        charge = event.data.object as Stripe.Charge;
      } else {
        const refund = event.data.object as Stripe.Refund;
        // Only a transition to succeeded moves money; pending/failed updates
        // would re-enter the strict path and throw on an empty list.
        if (refund.status !== "succeeded") return next();
        const refundChargeId =
          typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
        if (!refundChargeId) return next();
        charge = await stripe.charges.retrieve(refundChargeId);
      }
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!paymentIntentId) return next();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.metadata?.purpose === "credit_topup") return next();
      if ((await claimOrRespondDuplicate(event, res, next)) === "responded") return;

      try {
        const reversed = await reverseSubscriptionRuntimeAllowanceForChargeStrict(
          charge,
          "refund",
          undefined,
          undefined,
          event.id,
        );
        await markStripeEventProcessed(event.id);
        res.json({ received: true, runtime_allowance_reversal: reversed });
      } catch (error) {
        await releaseStripeEventClaim(event.id);
        throw error;
      }
      return;
    }

    if (event.type === "charge.dispute.created") {
      if ((await claimOrRespondDuplicate(event, res, next)) === "responded") return;
      try {
        // Creation can be a no-funds inquiry. Consume it here so the historical
        // billing route cannot reverse customer balance before Stripe reports
        // an actual withdrawal.
        await markStripeEventProcessed(event.id);
        res.json({ received: true, dispute_financial_movement: false });
      } catch (error) {
        await releaseStripeEventClaim(event.id);
        throw error;
      }
      return;
    }

    const eventType = event.type as string;
    if (
      eventType === "charge.dispute.funds_withdrawn" ||
      eventType === "charge.dispute.funds_reinstated"
    ) {
      const eventDispute = event.data.object as Stripe.Dispute;
      if ((await claimOrRespondDuplicate(event, res, next)) === "responded") return;

      try {
        const dispute = await retrieveAuthoritativeDispute(eventDispute.id);
        const direction =
          eventType === "charge.dispute.funds_withdrawn" ? "withdrawn" : "reinstated";
        const movementCents = disputeMovementCents(dispute, direction);
        if (!(movementCents > 0)) {
          throw new Error(
            `Stripe ${eventType} ${event.id} contains no ${direction} balance movement.`,
          );
        }
        if (!dispute.charge) {
          throw new Error(`Stripe dispute ${dispute.id} is missing charge linkage.`);
        }

        const charge = await stripe.charges.retrieve(
          typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
        );
        const paymentIntent = await resolvePaymentIntent(dispute, charge);
        const topUp = paymentIntent?.metadata?.purpose === "credit_topup";

        const mutated =
          direction === "withdrawn"
            ? topUp && paymentIntent
              ? await reverseTopUpDisputeStrict(paymentIntent, dispute, movementCents, event.id)
              : await reverseSubscriptionRuntimeAllowanceForChargeStrict(
                  charge,
                  "dispute",
                  dispute.id,
                  movementCents,
                  event.id,
                )
            : topUp && paymentIntent
              ? await restoreTopUpDisputeStrict(paymentIntent, dispute, movementCents, event.id)
              : await restoreSubscriptionRuntimeAllowanceForDisputeStrict(
                  charge,
                  dispute,
                  movementCents,
                  event.id,
                );

        await markStripeEventProcessed(event.id);
        res.json({
          received: true,
          dispute_financial_movement: direction,
          runtime_balance_mutated: mutated,
        });
      } catch (error) {
        await releaseStripeEventClaim(event.id);
        throw error;
      }
      return;
    }

    next();
  } catch (error) {
    log.error("Stripe Runtime Balance integrity preflight failed; Stripe must retry", {
      eventId: event.id,
      eventType: event.type,
      error: getErrorMessage(error),
    });
    next(AppError.fromHttpStatus(500, "Webhook handler failed"));
  }
}

type StripeClaimResult = "claimed" | "already_processed" | "in_flight";

async function claimStripeEventForPreflight(event: Stripe.Event): Promise<StripeClaimResult> {
  try {
    await drizzle.insert(schema.stripeEvents).values({
      eventId: event.id,
      eventType: event.type,
      status: "processing",
    });
    return "claimed";
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    if (!/duplicate key|23505/i.test(message) && (err as { code?: string }).code !== "23505") {
      return "in_flight";
    }
    const [prior] = await drizzle
      .select({ status: schema.stripeEvents.status, at: schema.stripeEvents.processedAt })
      .from(schema.stripeEvents)
      .where(eq(schema.stripeEvents.eventId, event.id))
      .limit(1);
    if (prior?.status === "processed") return "already_processed";
    const abandonedAfterMs = 5 * 60 * 1000;
    const isProcessing = prior?.status === "processing";
    const stale = isProcessing && Date.now() - new Date(prior.at ?? 0).getTime() > abandonedAfterMs;
    if (isProcessing && stale) {
      await releaseStripeEventClaim(event.id);
      await drizzle.insert(schema.stripeEvents).values({
        eventId: event.id,
        eventType: event.type,
        status: "processing",
      });
      return "claimed";
    }
    return "in_flight";
  }
}

async function markStripeEventProcessed(eventId: string): Promise<void> {
  await drizzle
    .update(schema.stripeEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(schema.stripeEvents.eventId, eventId));
}

async function releaseStripeEventClaim(eventId: string): Promise<void> {
  await drizzle.delete(schema.stripeEvents).where(eq(schema.stripeEvents.eventId, eventId));
}
