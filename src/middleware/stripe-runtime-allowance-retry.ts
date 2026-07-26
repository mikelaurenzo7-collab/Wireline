/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe webhook objects are vendor-defined payloads. */
import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";

import { AppError } from "../lib/api-error";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import {
  stripe,
  stripeAvailable,
  subscriptionBillingInterval,
} from "../lib/stripe-helpers";
import { reverseSubscriptionRuntimeAllowance } from "../lib/subscription-welcome-credit";

/**
 * Stripe can omit the expanded `charge.refunds` list from webhook payloads.
 * Always list the authoritative refund objects so every partial refund is
 * reversed under its own stable id. Replaying the event is safe because the
 * credit ledger is idempotent on `(user, ref_type, ref_id)`.
 */
async function listSucceededRefunds(chargeId: string): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;

  do {
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
    if (!page.has_more) break;
    const last = page.data.at(-1);
    if (!last) throw new Error("Stripe refund pagination returned has_more without a cursor.");
    startingAfter = last.id;
  } while (true);

  return refunds;
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
): Promise<boolean> {
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (!invoiceId) {
    log.warn("subscription allowance reversal skipped: charge has no invoice", {
      chargeId: charge.id,
      reason,
    });
    return false;
  }

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionField = (
    invoice as Stripe.Invoice & { subscription?: string | { id: string } }
  ).subscription;
  const subscriptionId =
    typeof subscriptionField === "string" ? subscriptionField : subscriptionField?.id;
  if (!subscriptionId) {
    log.warn("subscription allowance reversal skipped: invoice has no subscription", {
      chargeId: charge.id,
      invoiceId,
      reason,
    });
    return false;
  }

  const [row] = await drizzle
    .select({ userId: schema.subscriptions.userId, plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);
  if (!row?.userId) {
    log.warn("subscription allowance reversal skipped: subscription owner not found", {
      chargeId: charge.id,
      subscriptionId,
      reason,
    });
    return false;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const interval = subscriptionBillingInterval(subscription);
  const chargeCents = charge.amount || 0;

  if (reason === "dispute") {
    const reference = explicitReference || charge.id;
    await tenantStore.run(row.userId, () =>
      reverseSubscriptionRuntimeAllowance(
        row.userId,
        reference,
        row.plan,
        interval,
        "dispute",
        1,
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

  await tenantStore.run(row.userId, async () => {
    for (const refund of refunds) {
      const portion = chargeCents > 0 ? Math.min(1, refund.amount / chargeCents) : 1;
      await reverseSubscriptionRuntimeAllowance(
        row.userId,
        refund.id,
        row.plan,
        interval,
        "refund",
        portion,
      );
    }
  });
  return true;
}

/**
 * Financial-integrity preflight for subscription refunds/disputes.
 *
 * It is mounted on the exact raw-body Stripe webhook path before the legacy
 * billing router. Credit top-ups and unrelated events fall through unchanged.
 * Subscription reversals are fully handled here and acknowledged only after
 * the idempotent allowance ledger mutation succeeds.
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

      await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund");
      res.json({ received: true, runtime_allowance_reversal: true });
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

      const charge = await stripe.charges.retrieve(
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
      );
      await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", dispute.id);
      res.json({ received: true, runtime_allowance_reversal: true });
      return;
    }

    next();
  } catch (error) {
    log.error("subscription Runtime Allowance reversal failed; Stripe must retry", {
      eventId: event.id,
      eventType: event.type,
      error: getErrorMessage(error),
    });
    next(AppError.fromHttpStatus(500, "Webhook handler failed"));
  }
}
