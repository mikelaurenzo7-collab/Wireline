import type { RequestHandler } from "express";
import { and, eq, lt } from "drizzle-orm";
import type Stripe from "stripe";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";

const ABANDONED_STRIPE_CLAIM_AFTER_MS = 5 * 60 * 1000;

/**
 * Reclaim an abandoned Stripe event before the canonical billing router tries
 * to insert its idempotency claim.
 *
 * The latest billing-router hardening can conditionally delete a stale claim,
 * but its duplicate-key catch still terminates with a generic 503 after a
 * successful reclaim. Running the same atomic predicate as signed pre-routing
 * middleware means the canonical handler sees no row, wins its ordinary insert,
 * and processes the financial event in the same delivery. Invalid signatures
 * never reach the database; the canonical handler remains the source of truth
 * for signature-error responses and all event semantics.
 */
export const reclaimAbandonedStripeWebhookClaim: RequestHandler = async (req, _res, next) => {
  if (req.method !== "POST") return next();
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) return next();

  const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !Buffer.isBuffer(req.body)) return next();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // Preserve the canonical handler's bounded rejection log and 400 response.
    return next();
  }

  try {
    const cutoff = new Date(Date.now() - ABANDONED_STRIPE_CLAIM_AFTER_MS);
    const [reclaimed] = await drizzle
      .delete(schema.stripeEvents)
      .where(
        and(
          eq(schema.stripeEvents.eventId, event.id),
          eq(schema.stripeEvents.status, "processing"),
          lt(schema.stripeEvents.processedAt, cutoff),
        ),
      )
      .returning({ eventId: schema.stripeEvents.eventId });

    if (reclaimed) {
      log.warn("Reclaimed abandoned Stripe webhook claim before canonical handling", {
        eventId: event.id,
        eventType: event.type,
      });
    }

    return next();
  } catch (error) {
    log.error("Stripe stale-claim preflight failed closed", {
      eventId: event.id,
      eventType: event.type,
      error: getErrorMessage(error),
    });
    return next(
      AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later."),
    );
  }
};
