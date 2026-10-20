import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";

import { AppError } from "../lib/api-error";
import { addCredit, reverseCredit } from "../lib/credit-wallet";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import {
  stripe,
  stripeAvailable,
  basePlanInvoiceShare,
  stripeInvoiceIdForCharge,
  stripeSubscriptionIdForInvoice,
  runtimeAllowanceReferencesForInvoice,
} from "../lib/stripe-helpers";
import {
  reverseSubscriptionRuntimeAllowance,
  type SubscriptionBillingInterval,
} from "../lib/subscription-welcome-credit";
import {
  disputeBalanceMovementCents,
  proportionalTopUpCreditUsd,
  runtimeAllowanceMovementUsd,
  subscriptionDisputeAllowancePortion,
} from "../lib/stripe-dispute-accounting";
import {
  claimStripeEvent,
  completeStripeEventClaim,
  releaseStripeEventClaim,
  type StripeEventClaimOwnership,
} from "../lib/stripe-event-claim";
import { reconcilePaidAllowanceFundingForCharge } from "../lib/stripe-paid-allowance-funding";
import {
  assertStripeTopUpMovementOwnership,
  hasPostedStripeTopUpCredit,
  resolveStripeTopUpCredit,
} from "../lib/stripe-topup-refund-reconciliation";
import {
  assertStripeRefundInventoryCaughtUp,
  type StripeRefundLifecycleExpectation,
} from "../lib/stripe-refund-lifecycle";

/**
 * Stripe can omit the expanded `charge.refunds` list from webhook payloads.
 * Always list the authoritative refund objects so every partial refund is
 * reversed under its own stable id. Replaying the event is safe because the
 * credit ledger is idempotent on `(user, ref_type, ref_id)`.
 */
export async function listSucceededRefunds(
  chargeId: string,
  lifecycle?: { charge: Stripe.Charge; expectation: StripeRefundLifecycleExpectation },
): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(...page.data);
    hasMore = page.has_more;
    if (!hasMore) break;
    const last = page.data.at(-1);
    if (!last) throw new Error("Stripe refund pagination returned has_more without a cursor.");
    startingAfter = last.id;
  }

  if (lifecycle)
    assertStripeRefundInventoryCaughtUp(lifecycle.charge, refunds, lifecycle.expectation);
  return refunds.filter(
    (refund) => (!refund.status || refund.status === "succeeded") && refund.amount > 0,
  );
}

type SubscriptionAllowanceContext = {
  userId: string;
  planId: string;
  interval: SubscriptionBillingInterval;
  allowanceShare: number;
  chargeCents: number;
  grantAmountUsd: number;
  grantReference: string;
};

/**
 * Resolve the subscription-funded portion of a charge from the historical
 * Stripe objects that actually funded it.
 *
 * A dispute can arrive months after cancellation and resubscription, so the
 * tenant's current subscription row may hold a different subscription id and
 * plan. Prefer the exact subscription id, fall back to the stable customer
 * for ownership, then join the invoice's full base-plan period to the posted
 * ledger grant. Stripe subscriptions can change price and interval in place;
 * only the original grant proves the dollars that may be reversed.
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
  const subscriptionId = stripeSubscriptionIdForInvoice(invoice);
  if (!subscriptionId) {
    log.info("subscription allowance operation skipped: invoice has no subscription", {
      chargeId: charge.id,
      invoiceId,
      operation,
    });
    return null;
  }

  if (invoice.lines?.has_more) {
    const lines: Stripe.InvoiceLineItem[] = [];
    for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
      lines.push(line);
    }
    invoice.lines = { ...invoice.lines, data: lines, has_more: false };
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

  const grantReferences = runtimeAllowanceReferencesForInvoice(invoice, subscriptionId);
  // A proration adjusts plan price without issuing another period grant.
  if (grantReferences.length === 0) return null;
  if (grantReferences.length !== 1) {
    throw new Error(`Stripe invoice ${invoiceId} funds multiple Runtime Allowance periods.`);
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
      `Stripe subscription ${subscriptionId} funded Runtime Allowance but its BotBound owner is unresolved.`,
    );
  }

  const baseReference = grantReferences[0];
  const grants = await tenantStore.run(owner.userId, () =>
    drizzle
      .select({
        reference: schema.creditLedger.refId,
        amountUsd: schema.creditLedger.deltaUsd,
        metadata: schema.creditLedger.metadata,
      })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, owner.userId),
          eq(schema.creditLedger.refType, "subscription_runtime_allowance"),
          or(
            eq(schema.creditLedger.refId, baseReference),
            sql`${schema.creditLedger.refId} like ${`${baseReference}:slice:%`}`,
          ),
        ),
      )
      .limit(16),
  );
  if (grants.length === 0) {
    throw new Error(
      `Stripe invoice ${invoiceId} has no unambiguous posted Runtime Allowance grant.`,
    );
  }
  let grantAmountUsd = 0;
  let planId: string | null = null;
  let interval: "month" | "year" | null = null;
  for (const grant of grants) {
    const amountUsd = Number(grant.amountUsd);
    const metadata = grant.metadata as { plan_id?: unknown; billing_interval?: unknown } | null;
    if (
      !Number.isFinite(amountUsd) ||
      !(amountUsd > 0) ||
      !grant.reference ||
      typeof metadata?.plan_id !== "string" ||
      !metadata.plan_id ||
      (metadata.billing_interval !== "month" && metadata.billing_interval !== "year")
    ) {
      throw new Error(
        grants.length === 1
          ? `Stripe invoice ${invoiceId} has an invalid posted Runtime Allowance grant.`
          : `Stripe invoice ${invoiceId} has no unambiguous posted Runtime Allowance grant.`,
      );
    }
    if (planId && (planId !== metadata.plan_id || interval !== metadata.billing_interval)) {
      throw new Error(
        `Stripe invoice ${invoiceId} has no unambiguous posted Runtime Allowance grant.`,
      );
    }
    planId = metadata.plan_id;
    interval = metadata.billing_interval;
    grantAmountUsd = Math.round((grantAmountUsd + amountUsd) * 100) / 100;
  }
  if (!planId || !interval) {
    throw new Error(
      `Stripe invoice ${invoiceId} has no unambiguous posted Runtime Allowance grant.`,
    );
  }
  const metadata = {
    plan_id: planId,
    billing_interval: interval,
  };
  const grant = { reference: baseReference, amountUsd: grantAmountUsd, metadata };

  return {
    userId: owner.userId,
    planId: metadata.plan_id,
    interval: metadata.billing_interval,
    allowanceShare,
    chargeCents: charge.amount || 0,
    grantAmountUsd,
    grantReference: grant.reference,
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
  // Dispute balance_transactions are returned inline (zero, one, or two
  // objects); Stripe does not document them as an expandable field. Passing
  // an unsupported expand would turn every withdrawal/reinstatement webhook
  // into a retry loop before financial accounting can run.
  return stripe.disputes.retrieve(disputeId);
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
  expectation?: StripeRefundLifecycleExpectation,
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
        { amountUsd: context.grantAmountUsd, reference: context.grantReference },
      ),
    );
    return true;
  }

  if (!expectation && (charge.amount_refunded || 0) <= 0) return false;
  const refunds = await listSucceededRefunds(
    charge.id,
    expectation ? { charge, expectation } : undefined,
  );
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
        { amountUsd: context.grantAmountUsd, reference: context.grantReference },
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
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const context = chargeId ? await resolveStripeTopUpCredit({ stripe, chargeId }) : null;
  if (
    !context ||
    context.paymentIntent.id !== paymentIntent.id ||
    context.charge.currency !== dispute.currency ||
    (dispute.payment_intent &&
      (typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent.id) !== paymentIntent.id)
  ) {
    throw new Error(
      `Stripe top-up dispute ${dispute.id} is missing verified original Checkout credit provenance.`,
    );
  }
  await assertStripeTopUpMovementOwnership(
    context,
    ["stripe_dispute", "stripe_dispute_restoration"],
    [dispute.id],
  );
  const userId = context.original.userId;
  const purchasedCreditUsd = context.grantCents / 100;

  const amountUsd = proportionalTopUpCreditUsd(
    withdrawnCents,
    context.charge.amount,
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
  const calculatedAmountUsd = runtimeAllowanceMovementUsd(context.grantAmountUsd, portion);
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
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const context = chargeId ? await resolveStripeTopUpCredit({ stripe, chargeId }) : null;
  if (
    !context ||
    context.paymentIntent.id !== paymentIntent.id ||
    context.charge.currency !== dispute.currency ||
    (dispute.payment_intent &&
      (typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent.id) !== paymentIntent.id)
  ) {
    throw new Error(
      `Stripe top-up dispute ${dispute.id} is missing verified original Checkout credit provenance.`,
    );
  }
  await assertStripeTopUpMovementOwnership(
    context,
    ["stripe_dispute", "stripe_dispute_restoration"],
    [dispute.id],
  );
  const userId = context.original.userId;
  const purchasedCreditUsd = context.grantCents / 100;

  const calculatedAmountUsd = proportionalTopUpCreditUsd(
    reinstatedCents,
    context.charge.amount,
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
): Promise<StripeEventClaimOwnership | null> {
  const result = await claimStripeEvent(event.id, event.type);
  if (result.kind === "already_processed") {
    res.json({ received: true, duplicate: true });
    return null;
  }
  if (result.kind === "in_flight") {
    next(AppError.fromHttpStatus(503, "Webhook still processing. Retry."));
    return null;
  }
  return result.claim;
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
     * This preflight owns both events under the same claim and strict
     * per-refund.id reversal. The billing router's fallback also delegates
     * here so no alternate mount can reintroduce charge-id accounting.
     */
    if (
      event.type === "charge.refunded" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      let charge: Stripe.Charge;
      let returnedRefund = false;
      if (event.type === "charge.refunded") {
        charge = event.data.object as Stripe.Charge;
      } else {
        const refund = event.data.object as Stripe.Refund;
        // Failed/canceled refunds can return previously succeeded funds.
        // Pending/inquiry states must never revoke paid-period admission.
        if (!["succeeded", "failed", "canceled"].includes(refund.status ?? "")) return next();
        returnedRefund = refund.status !== "succeeded";
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
      const claim = await claimOrRespondDuplicate(event, res, next);
      if (!claim) return;

      try {
        const expectation =
          event.type === "charge.refunded"
            ? { expectedCharge: event.data.object as Stripe.Charge }
            : { expectedRefund: event.data.object as Stripe.Refund };
        const fundingReconciled = await reconcilePaidAllowanceFundingForCharge({
          stripe,
          chargeId: charge.id,
          providerEventId: event.id,
          ...expectation,
        });
        // Canonical invoice ownership outranks mutable purpose metadata.
        // Standalone top-ups remain owned by the existing billing router.
        if (
          !fundingReconciled &&
          (paymentIntent.metadata?.purpose === "credit_topup" ||
            (await hasPostedStripeTopUpCredit(paymentIntentId)))
        ) {
          await releaseStripeEventClaim(claim);
          return next();
        }
        if (returnedRefund && !fundingReconciled)
          await listSucceededRefunds(charge.id, { charge, expectation });
        const reversed = returnedRefund
          ? false
          : await reverseSubscriptionRuntimeAllowanceForChargeStrict(
              charge,
              "refund",
              undefined,
              undefined,
              event.id,
              expectation,
            );
        await completeStripeEventClaim(claim);
        res.json({
          received: true,
          runtime_allowance_reversal: reversed,
          ...(fundingReconciled ? { paid_allowance_funding_reconciled: true } : {}),
        });
      } catch (error) {
        await releaseStripeEventClaim(claim);
        throw error;
      }
      return;
    }

    if (event.type === "charge.dispute.created") {
      const claim = await claimOrRespondDuplicate(event, res, next);
      if (!claim) return;
      try {
        // Creation can be a no-funds inquiry. Consume it here so the historical
        // billing route cannot reverse customer balance before Stripe reports
        // an actual withdrawal.
        await completeStripeEventClaim(claim);
        res.json({ received: true, dispute_financial_movement: false });
      } catch (error) {
        await releaseStripeEventClaim(claim);
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
      const claim = await claimOrRespondDuplicate(event, res, next);
      if (!claim) return;

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
        const fundingReconciled = await reconcilePaidAllowanceFundingForCharge({
          stripe,
          chargeId: charge.id,
          providerEventId: event.id,
          dispute,
        });
        const topUp =
          !fundingReconciled &&
          paymentIntent &&
          (paymentIntent.metadata?.purpose === "credit_topup" ||
            (await hasPostedStripeTopUpCredit(paymentIntent.id)));

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

        await completeStripeEventClaim(claim);
        res.json({
          received: true,
          dispute_financial_movement: direction,
          runtime_balance_mutated: mutated,
          ...(fundingReconciled ? { paid_allowance_funding_reconciled: true } : {}),
        });
      } catch (error) {
        await releaseStripeEventClaim(claim);
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
