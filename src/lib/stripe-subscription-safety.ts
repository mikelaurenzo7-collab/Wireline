import type Stripe from "stripe";

import { stripe } from "./stripe-helpers";

const POTENTIALLY_LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "paused",
]);

type StripeSubscriptionClient = Pick<Stripe, "subscriptions">;

/** Exhaust the customer inventory before allowing a second billable checkout. */
export async function findPotentiallyLiveStripeSubscription(
  customerId: string,
  client: StripeSubscriptionClient = stripe,
): Promise<Stripe.Subscription | null> {
  let startingAfter: string | undefined;

  for (;;) {
    const page = await client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const live = page.data.find((subscription) =>
      POTENTIALLY_LIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
    );
    if (live) return live;
    if (!page.has_more) return null;

    const last = page.data.at(-1);
    if (!last) {
      throw new Error("Stripe subscription pagination returned has_more without a cursor.");
    }
    startingAfter = last.id;
  }
}
