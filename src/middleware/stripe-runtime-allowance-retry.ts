import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";

import { AppError } from "../lib/api-error";
import { addCredit } from "../lib/credit-wallet";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";
import {
  stripe,
  stripeAvailable,
  subscriptionBillingInterval,
  basePlanInvoiceShare,
} from "../lib/stripe-helpers";
import {
  reverseSubscriptionRuntimeAllowance,
  runtimeAllowanceUsdForPlan,
  type SubscriptionBillingInterval,
} from "../lib/subscription-welcome-credit";
import {
  disputeRestorationRequired,
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
  planId: string | null;
  interval: SubscriptionBillingInterval;
  allowanceShare: number;
  chargeCents: number;
};

/**
 * Resolve the subscription-funded portion of a charge. A charge that did not
 * fund a base plan is legitimately not applicable; a subscription charge whose
 * local owner cannot be resolved is an integrity failure and must be retried.
 */
async function resolveSubscriptionAllowanceContext(
  charge: Stripe.Charge,
  operation: "refund" | "dispute" | "restoration",
): Promise<SubscriptionAllowanceContext | null> {
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (!invoiceId) {
    log.warn("subscription allowance operation skipped: charge has no invoice", {
      chargeId: charge.id,
      operation,
    });
    return null;
  }

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionField = (
    invoice as Stripe.Invoice & { subscription?: string | { id: string } }
  ).subscription;
  const subscriptionId =
    typeof subscriptionField === "string" ? subscriptionField : subscriptionField?.id;
  if (!subscriptionId) {
    log.warn("subscription allowance operation skipped: invoice has no subscription", {
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

  const [row] = await drizzle
    .select({ userId: schema.subscriptions.userId, plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);
  if (!row?.userId) {
    throw new Error(
      `Stripe subscription ${subscriptionId} funded Runtime Allowance but its Wireline owner is unresolved.`,
    );
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return {
    userId: row.userId,
    planId: row.plan,
    interval: subscriptionBillingInterval(subscription),
    allowanceShare,
    chargeCents: charge.amount || 0,
  };
}

async function ledgerMovementExists(
  userId: string,
  refType: string,
  refId: string,
): Promise<boolean> {
  const [row] = await drizzle
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, refType),
        eq(schema.creditLedger.refId, refId),
      ),
    )
    .limit(1);
  return !!row?.id;
}

/**
 * Strict subscription Runtime Allowance reversal.
 *
 * Unlike the legacy helper embedded in billing-routes, this function never
 * swallows persistence/provider failures. The public webhook middleware returns
 * 5xx so Stripe redelivers until the idempotent ledger writes complete.
 */
export async function reverseSubscriptionRuntimeAllowanceForChargeStrict(
  charge: Stripe.Charge,
  reason: "refund" | "dispute",
  explicitReference?: string,
  disputeAmountCents?: number,
): Promise<boolean> {
  const context = await resolveSubscriptionAllowanceContext(charge, reason);
  if (!context) return false;

  if (reason === "dispute") {
    const reference = explicitReference || charge.id;
    const portion = subscriptionDisputeAllowancePortion(
      disputeAmountCents ?? context.chargeCents,
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
      ),
    );
    return true;
  }

  if ((charge.amount_refunded || 0) <= 0) return false;
  const refunds = await listSucceededRefunds(charge.id);
  if (refunds.length === 0) {
    // Do not acknowledge a cumulative amount under charge.id. That key would
    // collide on a later partial-refund event and silently strand refunded
    // allowance. A retry is safer than an ambiguous financial mutation.
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
      );
    }
  });
  return true;
}

async function restoreSubscriptionRuntimeAllowanceForDisputeStrict(
  charge: Stripe.Charge,
  dispute: Stripe.Dispute,
  providerEventId: string,
): Promise<boolean> {
  const context = await resolveSubscriptionAllowanceContext(charge, "restoration");
  if (!context) return false;

  const portion = subscriptionDisputeAllowancePortion(
    dispute.amount,
    context.chargeCents,
    context.allowanceShare,
  );
  const amountUsd = runtimeAllowanceMovementUsd(
    runtimeAllowanceUsdForPlan(context.planId, context.interval),
    portion,
  );
  if (!(amountUsd > 0)) return false;

  await tenantStore.run(context.userId, async () => {
    const reversed = await ledgerMovementExists(
      context.userId,
      "subscription_runtime_allowance_reversal",
      dispute.id,
    );
    if (!reversed) {
      throw new Error(
        `Stripe dispute ${dispute.id} restoration arrived before its subscription allowance reversal.`,
      );
    }

    await addCredit(
      context.userId,
      amountUsd,
      "subscription_runtime_allowance_dispute_restored",
      {
        type: "subscription_runtime_allowance_dispute_restoration",
        id: dispute.id,
        entryKind: "adjustment",
        source: "stripe",
        provider: "stripe",
        providerEventId,
        providerObjectId: dispute.id,
        customerReason: "Runtime Allowance restored after a won payment dispute",
        metadata: {
          plan_id: context.planId,
          billing_interval: context.interval,
          runtime_allowance_usd: amountUsd,
          restoration_portion: portion,
          dispute_status: dispute.status,
        },
      },
    );
  });
  return true;
}

async function restoreTopUpDisputeStrict(
  paymentIntent: Stripe.PaymentIntent,
  dispute: Stripe.Dispute,
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
    dispute.amount,
    paymentIntent.amount || 0,
    purchasedCreditUsd,
  );
  if (!(amountUsd > 0)) return false;

  await tenantStore.run(userId, async () => {
    const reversed = await ledgerMovementExists(userId, "stripe_dispute", dispute.id);
    if (!reversed) {
      throw new Error(
        `Stripe dispute ${dispute.id} restoration arrived before its top-up reversal.`,
      );
    }

    await addCredit(userId, amountUsd, "web_topup_dispute_restored", {
      type: "stripe_dispute_restoration",
      id: dispute.id,
      entryKind: "adjustment",
      source: "stripe",
      provider: "stripe",
      providerEventId,
      providerObjectId: dispute.id,
      customerReason: "Runtime Balance restored after a won payment dispute",
      metadata: {
        payment_intent_id: paymentIntent.id,
        dispute_status: dispute.status,
        restored_usd: amountUsd,
      },
    });
  });
  return true;
}

/**
 * Financial-integrity preflight for subscription refunds/disputes and won
 * dispute restorations.
 *
 * It is mounted on the exact raw-body Stripe webhook path before the legacy
 * billing router. Credit top-up refund/dispute creation retains the canonical
 * wallet path. Subscription reversals and all won-dispute restorations are
 * acknowledged only after their idempotent ledger mutations succeed.
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
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // The canonical billing route owns signature-error logging and its 400
    // response. Falling through avoids two divergent public error contracts.
    return next();
  }

  try {
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!paymentIntentId) return next();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.metadata?.purpose === "credit_topup") return next();

      const claimed = await claimStripeEventForPreflight(event);
      if (claimed === "already_processed") {
        res.json({ received: true, runtime_allowance_reversal: true, duplicate: true });
        return;
      }
      if (claimed === "in_flight") {
        next(AppError.fromHttpStatus(503, "Webhook still processing. Retry."));
        return;
      }

      try {
        await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund");
        await markStripeEventProcessed(event.id);
        res.json({ received: true, runtime_allowance_reversal: true });
      } catch (error) {
        await releaseStripeEventClaim(event.id);
        throw error;
      }
      return;
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      if (!paymentIntentId) return next();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.metadata?.purpose === "credit_topup" || !dispute.charge) return next();

      const claimed = await claimStripeEventForPreflight(event);
      if (claimed === "already_processed") {
        res.json({ received: true, runtime_allowance_reversal: true, duplicate: true });
        return;
      }
      if (claimed === "in_flight") {
        next(AppError.fromHttpStatus(503, "Webhook still processing. Retry."));
        return;
      }

      try {
        const charge = await stripe.charges.retrieve(
          typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
        );
        await reverseSubscriptionRuntimeAllowanceForChargeStrict(
          charge,
          "dispute",
          dispute.id,
          dispute.amount,
        );
        await markStripeEventProcessed(event.id);
        res.json({ received: true, runtime_allowance_reversal: true });
      } catch (error) {
        await releaseStripeEventClaim(event.id);
        throw error;
      }
      return;
    }

    const eventType = event.type as string;
    if (
      (eventType === "charge.dispute.closed" ||
        eventType === "charge.dispute.funds_reinstated") &&
      disputeRestorationRequired(
        eventType,
        (event.data.object as Stripe.Dispute).status,
      )
    ) {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      if (!paymentIntentId || !dispute.charge) {
        throw new Error(`Stripe won dispute ${dispute.id} is missing payment or charge linkage.`);
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const charge = await stripe.charges.retrieve(
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
      );
      const claimed = await claimStripeEventForPreflight(event);
      if (claimed === "already_processed") {
        res.json({ received: true, dispute_restoration: true, duplicate: true });
        return;
      }
      if (claimed === "in_flight") {
        next(AppError.fromHttpStatus(503, "Webhook still processing. Retry."));
        return;
      }

      try {
        const restored =
          paymentIntent.metadata?.purpose === "credit_topup"
            ? await restoreTopUpDisputeStrict(paymentIntent, dispute, event.id)
            : await restoreSubscriptionRuntimeAllowanceForDisputeStrict(
                charge,
                dispute,
                event.id,
              );
        await markStripeEventProcessed(event.id);
        res.json({ received: true, dispute_restoration: restored });
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
    const stale =
      isProcessing && Date.now() - new Date(prior.at ?? 0).getTime() > abandonedAfterMs;
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
