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
  stripeSubscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | null;
};

async function readSubscription(userId: string): Promise<SubscriptionSnapshot | null> {
  const [subscription] = await drizzle
    .select({
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

export async function stopRenewalForDeletion(userId: string): Promise<RenewalChangeResult> {
  const subscription = await readSubscription(userId);
  const subscriptionId = subscription?.stripeSubscriptionId?.trim();
  const terminalStatuses = new Set(["canceled", "incomplete_expired"]);

  if (
    !subscriptionId ||
    subscription?.cancelAtPeriodEnd ||
    terminalStatuses.has(subscription?.status || "")
  ) {
    return {
      changed: false,
      confirmed: true,
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }

  if (!stripeAvailable()) {
    log.error("account deletion could not stop renewal because Stripe is unavailable", {
      userId,
      subscriptionId,
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    try {
      await syncSubscriptionFromStripe(updated);
    } catch (syncError) {
      log.warn("account deletion stopped renewal but local Stripe sync needs recovery", {
        userId,
        subscriptionId,
        error: getErrorMessage(syncError),
      });
    }
    return {
      changed: true,
      confirmed: updated.cancel_at_period_end || updated.status === "canceled",
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  } catch (error) {
    if (isMissingStripeResource(error)) {
      log.warn("account deletion found no live Stripe subscription to renew", {
        userId,
        subscriptionId,
      });
      return {
        changed: false,
        confirmed: true,
        billingPeriodEnd: subscription.currentPeriodEnd,
      };
    }

    log.error("account deletion could not confirm renewal was stopped", {
      userId,
      subscriptionId,
      error: getErrorMessage(error),
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  }
}

export async function resumeRenewalAfterDeletionCancellation(
  userId: string,
): Promise<RenewalChangeResult> {
  const subscription = await readSubscription(userId);
  const subscriptionId = subscription?.stripeSubscriptionId?.trim();
  const terminalStatuses = new Set(["canceled", "incomplete_expired"]);

  if (
    !subscriptionId ||
    !subscription?.cancelAtPeriodEnd ||
    terminalStatuses.has(subscription?.status || "")
  ) {
    return {
      changed: false,
      confirmed: !subscription?.cancelAtPeriodEnd,
      billingPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }

  if (!stripeAvailable()) {
    log.error("deletion cancellation could not resume renewal because Stripe is unavailable", {
      userId,
      subscriptionId,
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    try {
      await syncSubscriptionFromStripe(updated);
    } catch (syncError) {
      log.warn("deletion cancellation resumed renewal but local Stripe sync needs recovery", {
        userId,
        subscriptionId,
        error: getErrorMessage(syncError),
      });
    }
    return {
      changed: true,
      confirmed: !updated.cancel_at_period_end && updated.status !== "canceled",
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  } catch (error) {
    if (isMissingStripeResource(error)) {
      return {
        changed: false,
        confirmed: false,
        billingPeriodEnd: subscription.currentPeriodEnd,
      };
    }
    log.error("deletion cancellation could not confirm renewal resumed", {
      userId,
      subscriptionId,
      error: getErrorMessage(error),
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: subscription.currentPeriodEnd,
    };
  }
}
