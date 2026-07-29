import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { stripe, stripeAvailable, syncSubscriptionFromStripe } from "./stripe-helpers";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";

export type RenewalChangeResult = {
  changed: boolean;
  confirmed: boolean;
  billingPeriodEnd: Date | null;
};

type SubscriptionSnapshot = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | null;
};

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);
const DELETION_RENEWAL_MARKER = "wireline_deletion_renewal_stopped";

async function readSubscription(userId: string): Promise<SubscriptionSnapshot | null> {
  const [subscription] = await drizzle
    .select({
      stripeCustomerId: schema.subscriptions.stripeCustomerId,
      stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
      status: schema.subscriptions.status,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return subscription ?? null;
}

function isMissingStripeResource(error: unknown): boolean {
  const stripeError = error as {
    code?: string;
    statusCode?: number;
    raw?: { code?: string };
  };
  return (
    stripeError.statusCode === 404 ||
    stripeError.code === "resource_missing" ||
    stripeError.raw?.code === "resource_missing"
  );
}

function isTerminalSubscription(subscription: Stripe.Subscription): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status);
}

async function listCustomerSubscriptions(
  snapshot: SubscriptionSnapshot,
): Promise<Stripe.Subscription[]> {
  const byId = new Map<string, Stripe.Subscription>();
  const customerId = snapshot.stripeCustomerId?.trim();
  const primaryId = snapshot.stripeSubscriptionId?.trim();

  if (customerId) {
    // Auto-pagination matters for customers with separate add-on subscriptions.
    for await (const subscription of stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    })) {
      byId.set(subscription.id, subscription);
    }
  }

  if (primaryId && !byId.has(primaryId)) {
    try {
      const primary = await stripe.subscriptions.retrieve(primaryId);
      byId.set(primary.id, primary);
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  return [...byId.values()];
}

async function syncPrimarySubscription(
  userId: string,
  snapshot: SubscriptionSnapshot,
  updated: Stripe.Subscription,
): Promise<void> {
  if (updated.id !== snapshot.stripeSubscriptionId) return;
  try {
    await syncSubscriptionFromStripe(updated);
  } catch (syncError) {
    log.warn("deletion billing changed Stripe but local sync needs recovery", {
      userId,
      subscriptionId: updated.id,
      error: getErrorMessage(syncError),
    });
  }
}

/**
 * Stop every renewable Stripe relationship for the customer, including
 * separately billed add-ons. A metadata marker records only the subscriptions
 * changed by deletion so cancellation can safely restore those renewals without
 * undoing a cancellation the customer had already chosen.
 */
export async function stopRenewalForDeletion(userId: string): Promise<RenewalChangeResult> {
  const snapshot = await readSubscription(userId);
  if (!snapshot?.stripeCustomerId && !snapshot?.stripeSubscriptionId) {
    return {
      changed: false,
      confirmed: true,
      billingPeriodEnd: snapshot?.currentPeriodEnd ?? null,
    };
  }

  if (!stripeAvailable()) {
    log.error("account deletion could not stop renewal because Stripe is unavailable", {
      userId,
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
    };
  }

  let subscriptions: Stripe.Subscription[];
  try {
    subscriptions = await listCustomerSubscriptions(snapshot);
  } catch (error) {
    if (isMissingStripeResource(error)) {
      return {
        changed: false,
        confirmed: true,
        billingPeriodEnd: snapshot.currentPeriodEnd,
      };
    }
    log.error("account deletion could not list every Stripe subscription", {
      userId,
      error: getErrorMessage(error),
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
    };
  }

  let changed = false;
  let confirmed = true;

  for (const subscription of subscriptions) {
    if (isTerminalSubscription(subscription) || subscription.cancel_at_period_end) continue;

    try {
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        metadata: { [DELETION_RENEWAL_MARKER]: "true" },
      });
      changed = true;
      confirmed = confirmed && (updated.cancel_at_period_end || updated.status === "canceled");
      await syncPrimarySubscription(userId, snapshot, updated);
    } catch (error) {
      if (isMissingStripeResource(error)) continue;
      confirmed = false;
      log.error("account deletion could not confirm every renewal was stopped", {
        userId,
        subscriptionId: subscription.id,
        error: getErrorMessage(error),
      });
    }
  }

  return {
    changed,
    confirmed,
    billingPeriodEnd: snapshot.currentPeriodEnd,
  };
}

/**
 * Restore only subscriptions Wireline marked when deletion was requested.
 * Pre-existing customer cancellations remain untouched.
 */
export async function resumeRenewalAfterDeletionCancellation(
  userId: string,
): Promise<RenewalChangeResult> {
  const snapshot = await readSubscription(userId);
  if (!snapshot?.stripeCustomerId && !snapshot?.stripeSubscriptionId) {
    return {
      changed: false,
      confirmed: true,
      billingPeriodEnd: snapshot?.currentPeriodEnd ?? null,
    };
  }

  if (!stripeAvailable()) {
    log.error("deletion cancellation could not inspect renewal because Stripe is unavailable", {
      userId,
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
    };
  }

  let subscriptions: Stripe.Subscription[];
  try {
    subscriptions = await listCustomerSubscriptions(snapshot);
  } catch (error) {
    log.error("deletion cancellation could not list Stripe subscriptions", {
      userId,
      error: getErrorMessage(error),
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
    };
  }

  let changed = false;
  let confirmed = true;

  for (const subscription of subscriptions) {
    if (subscription.metadata?.[DELETION_RENEWAL_MARKER] !== "true") continue;
    if (isTerminalSubscription(subscription)) {
      confirmed = false;
      continue;
    }

    try {
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        metadata: { [DELETION_RENEWAL_MARKER]: "" },
      });
      changed = true;
      confirmed = confirmed && !updated.cancel_at_period_end && updated.status !== "canceled";
      await syncPrimarySubscription(userId, snapshot, updated);
    } catch (error) {
      confirmed = false;
      log.error("deletion cancellation could not restore every marked renewal", {
        userId,
        subscriptionId: subscription.id,
        error: getErrorMessage(error),
      });
    }
  }

  return {
    changed,
    confirmed,
    billingPeriodEnd: snapshot.currentPeriodEnd,
  };
}
