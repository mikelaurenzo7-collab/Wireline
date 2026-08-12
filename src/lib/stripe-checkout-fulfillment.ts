import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";

import { checkoutOperations } from "../db/security-schema";
import * as schema from "../db/schema";
import { addCredit } from "./credit-wallet";
import { drizzle, tenantStore } from "./server-context";
import { stripe, syncSubscriptionFromStripe } from "./stripe-helpers";

const CHECKOUT_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export type StripeCheckoutFulfillment = {
  paymentSettled: boolean;
  subscriptionSynced: boolean;
  creditGranted: boolean;
  liveVideoEnabled: boolean;
};

export function isStripeCheckoutPaymentSettled(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

function checkoutOperationId(session: Stripe.Checkout.Session): string | null {
  const operationId = session.metadata?.wireline_checkout_operation_id?.trim() || "";
  return CHECKOUT_OPERATION_ID.test(operationId) ? operationId : null;
}

function checkoutSubscriptionId(session: Stripe.Checkout.Session): string | null {
  if (!session.subscription) return null;
  return typeof session.subscription === "string" ? session.subscription : session.subscription.id;
}

async function markCheckoutOperationCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const operationId = checkoutOperationId(session);
  if (!operationId) return;

  await drizzle
    .update(checkoutOperations)
    .set({ status: "completed", failureCode: null, updatedAt: new Date() })
    .where(
      and(
        eq(checkoutOperations.id, operationId),
        inArray(checkoutOperations.status, ["creating", "open"]),
      ),
    );
}

/**
 * Fulfill Checkout through one idempotent path. The webhook and authenticated
 * success redirect call the same routine, so either can repair the other
 * without double-crediting a wallet or clobbering the base subscription with
 * the live-video add-on. The settlement gate also makes this safe to reuse
 * when delayed-payment webhook delivery is enabled later.
 */
export async function fulfillStripeCheckoutSession(
  session: Stripe.Checkout.Session,
  options: { providerEventId?: string } = {},
): Promise<StripeCheckoutFulfillment> {
  const paymentSettled = isStripeCheckoutPaymentSettled(session);
  const result: StripeCheckoutFulfillment = {
    paymentSettled,
    subscriptionSynced: false,
    creditGranted: false,
    liveVideoEnabled: false,
  };

  if (session.mode === "subscription") {
    // Subscription Checkouts can also complete before a delayed payment is
    // settled. Do not sync an incomplete plan or close its durable operation;
    // the later success event must be the first path that grants access.
    if (!paymentSettled) return result;

    const userId = session.metadata?.wireline_user_id?.trim();
    if (!userId) {
      // An account-level webhook can receive unrelated Checkout Sessions. Only
      // Wireline-stamped subscriptions belong in our local projection.
      return result;
    }

    if (session.metadata?.purpose === "live_video_addon") {
      if (!checkoutSubscriptionId(session)) {
        throw new Error(`Settled live-video Checkout ${session.id} has no subscription.`);
      }

      const updated = await drizzle
        .update(schema.settings)
        .set({ liveVideoAddonEnabled: true, updatedAt: new Date() })
        .where(eq(schema.settings.userId, userId))
        .returning({ userId: schema.settings.userId });
      if (!updated[0]) {
        // A paid add-on without a durable workspace projection must stay
        // retryable; acknowledging it here would strand the entitlement.
        throw new Error(`Settled live-video Checkout ${session.id} has no Wireline workspace.`);
      }
      result.liveVideoEnabled = true;
      return result;
    }

    const subscriptionId = checkoutSubscriptionId(session);
    if (!subscriptionId) {
      throw new Error(`Wireline subscription Checkout ${session.id} has no subscription.`);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscriptionFromStripe(subscription);
    await markCheckoutOperationCompleted(session);
    result.subscriptionSynced = true;
    return result;
  }

  if (session.mode !== "payment" || session.metadata?.purpose !== "credit_topup") {
    return result;
  }
  if (!paymentSettled) return result;

  const userId = session.metadata.wireline_user_id?.trim();
  const creditUsd = Number(session.metadata.credit_usd);
  if (!userId || !Number.isFinite(creditUsd) || creditUsd <= 0) {
    // This is a paid Wireline object, not an unrelated Stripe event. Refuse to
    // acknowledge it so Stripe keeps retrying while operators repair metadata;
    // silently accepting would strand customer funds permanently.
    throw new Error(`Settled Runtime Balance Checkout ${session.id} has invalid metadata.`);
  }

  await tenantStore.run(userId, async () => {
    await addCredit(userId, creditUsd, "web_topup", {
      type: "stripe_session",
      id: session.id,
      entryKind: "top_up",
      source: "stripe",
      provider: "stripe",
      providerEventId: options.providerEventId,
      providerObjectId: session.id,
      customerReason: "Runtime Balance top-up",
      metadata: {
        checkout_session_id: session.id,
        payment_intent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
      },
    });
  });
  result.creditGranted = true;
  return result;
}
