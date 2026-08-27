import type Stripe from "stripe";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  isMissingStripeResource,
  stripe,
  stripeAvailable,
  syncSubscriptionFromStripe,
} from "./stripe-helpers";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { checkoutOperations } from "../db/security-schema";
import { getErrorMessage } from "./server-utils";
import { resolveOwnedStripeCustomer } from "./stripe-customer-binding";

export type RenewalChangeResult = {
  changed: boolean;
  confirmed: boolean;
  billingPeriodEnd: Date | null;
  checkoutSessionsExpired?: number;
};

export type SubscriptionSnapshot = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | null;
};

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);
const DELETION_RENEWAL_MARKER = "wireline_deletion_renewal_stopped";
const ACTIVE_CHECKOUT_STATES = ["creating", "open"] as const;

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

function isTerminalSubscription(subscription: Stripe.Subscription): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status);
}

function stripeObjectId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function expireOpenSession(sessionId: string): Promise<boolean> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (isMissingStripeResource(error)) return false;
    throw error;
  }
  if (session.status !== "open") return false;
  try {
    await stripe.checkout.sessions.expire(session.id);
    return true;
  } catch (error) {
    // Completion can win the exact Stripe-side race with expiration. Re-read
    // once: complete/expired is no longer payable and is therefore converged.
    if (isMissingStripeResource(error)) return false;
    const latest = await stripe.checkout.sessions.retrieve(session.id);
    if (latest.status !== "open") return false;
    throw error;
  }
}

/** Close every locally known and customer-enumerated hosted Checkout URL. */
export async function expireOpenCheckoutSessionsForDeletion(userId: string): Promise<{
  confirmed: boolean;
  expired: number;
  customerIds: string[];
}> {
  const [subscription, identity, operations] = await Promise.all([
    readSubscription(userId),
    drizzle
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    drizzle
      .select({
        id: checkoutOperations.id,
        stripeCustomerId: checkoutOperations.stripeCustomerId,
        stripeCheckoutSessionId: checkoutOperations.stripeCheckoutSessionId,
      })
      .from(checkoutOperations)
      .where(
        and(
          eq(checkoutOperations.userId, userId),
          inArray(checkoutOperations.status, [...ACTIVE_CHECKOUT_STATES]),
        ),
      ),
  ]);

  const localSessionIds = new Set(
    operations
      .map((operation) => operation.stripeCheckoutSessionId?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  const customerCandidates = new Set(
    [
      subscription?.stripeCustomerId?.trim(),
      ...operations.map((operation) => operation.stripeCustomerId?.trim()),
    ].filter((value): value is string => Boolean(value)),
  );
  const primarySubscriptionId = subscription?.stripeSubscriptionId?.trim() || null;
  const hasRemoteCreationEvidence =
    operations.length > 0 ||
    localSessionIds.size > 0 ||
    customerCandidates.size > 0 ||
    Boolean(primarySubscriptionId);
  if (!hasRemoteCreationEvidence) {
    return { confirmed: true, expired: 0, customerIds: [] };
  }
  if (!stripeAvailable() || !identity?.email) {
    return { confirmed: false, expired: 0, customerIds: [] };
  }

  // A legacy/drifted row may retain only the subscription id. Recover its
  // customer before cancellation so hosted URLs and Stripe PII are not left
  // behind after the local account disappears.
  if (primarySubscriptionId) {
    try {
      const remoteSubscription = await stripe.subscriptions.retrieve(primarySubscriptionId);
      const customerId = stripeObjectId(remoteSubscription.customer);
      if (customerId) customerCandidates.add(customerId);
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  const sessions = new Map<string, Stripe.Checkout.Session>();
  for (const sessionId of localSessionIds) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const customerId = stripeObjectId(session.customer);
      if (customerId) customerCandidates.add(customerId);
      sessions.set(session.id, session);
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  // Stripe customer creation is idempotent, but a killed process can lose the
  // returned id before local persistence. The 15-minute admission lease keeps
  // deletion out of Stripe Search's propagation window; metadata search then
  // recovers every remote-only customer created for this tenant.
  const safeUserId = userId.replace(/[^a-f0-9-]/gi, "");
  if (safeUserId !== userId) {
    return { confirmed: false, expired: 0, customerIds: [] };
  }
  for await (const customer of stripe.customers.search({
    query: `metadata['wireline_user_id']:'${safeUserId}'`,
    limit: 100,
  })) {
    if (!("deleted" in customer && customer.deleted)) customerCandidates.add(customer.id);
  }

  const ownedCustomers = new Set<string>();
  for (const customerId of customerCandidates) {
    const owned = await resolveOwnedStripeCustomer({
      customerId,
      userId,
      authenticatedEmail: identity.email,
    });
    if (!owned) {
      try {
        const remote = await stripe.customers.retrieve(customerId);
        if ("deleted" in remote && remote.deleted) continue;
      } catch (error) {
        if (isMissingStripeResource(error)) continue;
        throw error;
      }
      return { confirmed: false, expired: 0, customerIds: [] };
    }
    ownedCustomers.add(owned.id);
  }

  for (const session of sessions.values()) {
    const customerId = stripeObjectId(session.customer);
    const owned =
      session.metadata?.wireline_user_id === userId ||
      session.client_reference_id === userId ||
      Boolean(customerId && ownedCustomers.has(customerId));
    if (!owned) return { confirmed: false, expired: 0, customerIds: [] };
  }
  for (const customerId of ownedCustomers) {
    for await (const session of stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    })) {
      sessions.set(session.id, session);
    }
  }

  let expired = 0;
  for (const session of sessions.values()) {
    if (session.status !== "open") continue;
    if (await expireOpenSession(session.id)) expired++;
  }
  await drizzle
    .update(checkoutOperations)
    .set({ status: "expired", checkoutUrl: null, updatedAt: new Date() })
    .where(
      and(
        eq(checkoutOperations.userId, userId),
        inArray(checkoutOperations.status, [...ACTIVE_CHECKOUT_STATES]),
      ),
    );
  return { confirmed: true, expired, customerIds: [...ownedCustomers] };
}

export async function listCustomerSubscriptionsForDeletion(
  snapshot: SubscriptionSnapshot,
  stripeClient: Pick<Stripe, "subscriptions"> = stripe,
): Promise<Stripe.Subscription[]> {
  const byId = new Map<string, Stripe.Subscription>();
  const customerId = snapshot.stripeCustomerId?.trim();
  const primaryId = snapshot.stripeSubscriptionId?.trim();

  if (customerId) {
    try {
      // Auto-pagination matters for customers with separate add-on subscriptions.
      for await (const subscription of stripeClient.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      })) {
        byId.set(subscription.id, subscription);
      }
    } catch (error) {
      // A stale local customer id must not prevent the authoritative primary
      // subscription id below from being retrieved and stopped. Only Stripe's
      // missing-resource response is recoverable here; pagination, auth, rate
      // limit, and network failures remain fatal and block deletion cleanup.
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  if (primaryId && !byId.has(primaryId)) {
    try {
      const primary = await stripeClient.subscriptions.retrieve(primaryId);
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
 * separately billed add-ons. The metadata marker is audit context only:
 * canceling deletion never restarts billing automatically because a later
 * customer cancellation cannot be distinguished safely from this stop.
 */
export async function stopRenewalForDeletion(userId: string): Promise<RenewalChangeResult> {
  const snapshot = await readSubscription(userId);
  let checkoutClosure = { confirmed: false, expired: 0, customerIds: [] as string[] };
  try {
    checkoutClosure = await expireOpenCheckoutSessionsForDeletion(userId);
  } catch (error) {
    log.error("account deletion could not close every hosted Checkout session", {
      userId,
      error: getErrorMessage(error),
    });
  }
  if (!snapshot?.stripeCustomerId && !snapshot?.stripeSubscriptionId) {
    return {
      changed: false,
      confirmed: checkoutClosure.confirmed,
      billingPeriodEnd: snapshot?.currentPeriodEnd ?? null,
      checkoutSessionsExpired: checkoutClosure.expired,
    };
  }

  if (!stripeAvailable() || !checkoutClosure.confirmed) {
    log.error("account deletion could not confirm the complete Stripe billing closure", {
      userId,
      stripeAvailable: stripeAvailable(),
      checkoutSessionsClosed: checkoutClosure.confirmed,
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
      checkoutSessionsExpired: checkoutClosure.expired,
    };
  }

  let subscriptions: Stripe.Subscription[];
  try {
    subscriptions = await listCustomerSubscriptionsForDeletion(snapshot);
  } catch (error) {
    log.error("account deletion could not list every Stripe subscription", {
      userId,
      error: getErrorMessage(error),
    });
    return {
      changed: false,
      confirmed: false,
      billingPeriodEnd: snapshot.currentPeriodEnd,
      checkoutSessionsExpired: checkoutClosure.expired,
    };
  }

  let changed = false;
  let confirmed: boolean = checkoutClosure.confirmed;

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
    checkoutSessionsExpired: checkoutClosure.expired,
  };
}

/**
 * Reassert deletion-owned cancellation after a Stripe-hosted portal mutation.
 * Portal sessions cannot be revoked, so every subscription webhook plus the
 * hourly reconciliation loop restores the pending deletion's no-renewal state.
 */
export async function enforcePendingDeletionBillingForSubscription(
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const customerId = stripeObjectId(subscription.customer);
  const metadataUserId = subscription.metadata?.wireline_user_id?.trim() || null;
  const [local] = await drizzle
    .select({ userId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .where(
      or(
        eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
        ...(customerId ? [eq(schema.subscriptions.stripeCustomerId, customerId)] : []),
      ),
    )
    .limit(1);
  if (metadataUserId && local?.userId && metadataUserId !== local.userId) {
    throw new Error("Stripe subscription ownership disagrees with the local tenant binding.");
  }
  const userId = metadataUserId || local?.userId || null;
  if (!userId) return false;

  const [pending] = await drizzle
    .select({ id: schema.deletionQueue.id })
    .from(schema.deletionQueue)
    .where(and(eq(schema.deletionQueue.userId, userId), eq(schema.deletionQueue.status, "pending")))
    .limit(1);
  if (!pending) return false;

  const closure = await stopRenewalForDeletion(userId);
  if (!closure.confirmed) {
    throw new Error("Pending account deletion billing closure is not confirmed.");
  }
  return true;
}
