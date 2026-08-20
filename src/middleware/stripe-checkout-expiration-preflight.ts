import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";

import { checkoutOperations } from "../db/security-schema";
import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import { getErrorMessage } from "../lib/server-utils";

const CHECKOUT_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const ACTIVE_CHECKOUT_OPERATION_STATES = ["creating", "open"] as const;

/**
 * Terminalize abandoned subscription Checkout operations when Stripe expires
 * the provider session.
 *
 * This exact-path preflight owns only `checkout.session.expired`. It runs
 * before the broad billing router so abandoned sessions do not remain `open`
 * until the customer happens to start another checkout. The write is bounded
 * by the operation id, stamped tenant owner, exact Stripe session id, and an
 * active local state, so duplicate delivery and races with successful
 * fulfillment are harmless.
 */
export async function stripeCheckoutExpirationPreflight(
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
    // Preserve the canonical billing router's signature-failure response and
    // abuse logging rather than creating a second public error shape here.
    return next();
  }

  if (event.type !== "checkout.session.expired") return next();

  const session = event.data.object as Stripe.Checkout.Session;
  const operationId = session.metadata?.wireline_checkout_operation_id?.trim() || "";
  const userId = session.metadata?.wireline_user_id?.trim() || "";

  // Account-level Stripe endpoints can receive unrelated Checkout events. An
  // object without BotBound's ownership stamps is not ours to project locally;
  // acknowledge it without mutating another tenant or creating retry noise.
  if (
    !CHECKOUT_OPERATION_ID.test(operationId) ||
    !userId ||
    session.mode !== "subscription"
  ) {
    log.info("Ignored unstamped Stripe Checkout expiration", {
      eventId: event.id,
      sessionId: session.id,
    });
    res.json({ received: true, ignored: true });
    return;
  }

  try {
    const updated = await tenantStore.run(userId, () =>
      drizzle
        .update(checkoutOperations)
        .set({
          status: "expired",
          failureCode: "stripe_checkout_session_expired",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(checkoutOperations.id, operationId),
            eq(checkoutOperations.userId, userId),
            eq(checkoutOperations.stripeCheckoutSessionId, session.id),
            inArray(checkoutOperations.status, [...ACTIVE_CHECKOUT_OPERATION_STATES]),
          ),
        )
        .returning({ id: checkoutOperations.id }),
    );

    // Keep provider-event observability complete. If this insert transiently
    // fails after the idempotent terminalization, return a retryable error; the
    // repeated operation update is a no-op and the event ledger can recover.
    await drizzle
      .insert(schema.stripeEvents)
      .values({ eventId: event.id, eventType: event.type, status: "processed" })
      .onConflictDoNothing();

    log.info("Stripe Checkout expiration reconciled", {
      eventId: event.id,
      sessionId: session.id,
      operationId,
      terminalized: updated.length > 0,
    });
    res.json({ received: true, expired: updated.length > 0 });
  } catch (error) {
    log.error("Stripe Checkout expiration reconciliation failed", {
      eventId: event.id,
      sessionId: session.id,
      operationId,
      error: getErrorMessage(error),
    });
    next(error);
  }
}
