import type Stripe from "stripe";

import { stripe } from "./stripe-helpers";

/**
 * Stripe states that no longer carry a Live Video entitlement. Keep this in
 * one module so checkout fulfillment, duplicate prevention, and subscription
 * webhooks cannot drift into different answers for the same subscription.
 */
export const LIVE_VIDEO_ADDON_NON_ENTITLING_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "unpaid",
]);

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id;
}

export function isCurrentLiveVideoAddon(subscription: Stripe.Subscription): boolean {
  return (
    subscription.metadata?.purpose === "live_video_addon" &&
    !LIVE_VIDEO_ADDON_NON_ENTITLING_STATUSES.has(subscription.status)
  );
}

/**
 * List current Live Video add-ons on a customer, optionally excluding the
 * subscription whose terminal webhook is being reconciled.
 */
export async function listCurrentLiveVideoAddons(
  customerId: string,
  excludeSubscriptionId?: string,
): Promise<Stripe.Subscription[]> {
  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  return listed.data.filter(
    (subscription) =>
      subscription.id !== excludeSubscriptionId && isCurrentLiveVideoAddon(subscription),
  );
}

/**
 * Re-read the subscription attached to Checkout before projecting the local
 * entitlement. Checkout events can arrive after a cancellation webhook, so
 * the session payload itself is historical evidence, not current authority.
 */
export async function resolveCurrentLiveVideoCheckoutEntitlement(input: {
  subscriptionId: string;
  userId: string;
  checkoutCustomerId?: string | null;
}): Promise<{ enabled: boolean; subscription: Stripe.Subscription }> {
  const subscription = await stripe.subscriptions.retrieve(input.subscriptionId);
  const subscriptionUserId = subscription.metadata?.wireline_user_id?.trim() || "";
  if (
    subscription.metadata?.purpose !== "live_video_addon" ||
    subscriptionUserId !== input.userId
  ) {
    throw new Error(
      `Live Video subscription ${subscription.id} does not belong to the Checkout owner.`,
    );
  }

  const customerId = stripeCustomerId(subscription.customer);
  if (input.checkoutCustomerId && customerId !== input.checkoutCustomerId) {
    throw new Error(
      `Live Video subscription ${subscription.id} does not belong to the Checkout customer.`,
    );
  }

  if (isCurrentLiveVideoAddon(subscription)) {
    return { enabled: true, subscription };
  }

  // A legacy customer can still have more than one add-on. A delayed Checkout
  // for the canceled one must not disable a surviving paid subscription.
  const survivors = await listCurrentLiveVideoAddons(customerId, subscription.id);
  return { enabled: survivors.length > 0, subscription };
}
