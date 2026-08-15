import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import * as schema from "../db/schema";
import { drizzle, tenantStore } from "./server-context";
import { isMissingStripeResource, stripe } from "./stripe-helpers";

export type CustomerBindingDependencies = {
  retrieve(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  update(
    customerId: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  localUserIds(customerId: string): Promise<string[]>;
};

const defaultDependencies: CustomerBindingDependencies = {
  retrieve: (customerId) => stripe.customers.retrieve(customerId),
  update: (customerId, metadata) => stripe.customers.update(customerId, { metadata }),
  localUserIds: async (customerId) => {
    // Uniqueness is a platform-wide ownership fact. Running this lookup inside
    // the caller's tenant context would let RLS hide another tenant's stale
    // projection and could make an ambiguous legacy Stripe customer look safe
    // to claim. Execute the lazy Drizzle query while the tenant store is exited
    // so the server role can observe up to two owners and fail closed.
    const rows = await tenantStore.exit(() =>
      drizzle
        .select({ userId: schema.subscriptions.userId })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.stripeCustomerId, customerId))
        .limit(2)
        .execute(),
    );
    return rows.map((row) => row.userId);
  },
};

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * A metadata-free legacy customer can be claimed only with two independent
 * ownership signals: the Stripe email matches the signed-in identity and the
 * customer id appears on exactly one local subscription projection, this one.
 */
export function canRepairLegacyStripeCustomerBinding(
  customer: Stripe.Customer,
  userId: string,
  authenticatedEmail: string,
  localUserIds: string[],
): boolean {
  return (
    !customer.metadata?.wireline_user_id?.trim() &&
    Boolean(normalizeEmail(authenticatedEmail)) &&
    normalizeEmail(customer.email) === normalizeEmail(authenticatedEmail) &&
    localUserIds.length === 1 &&
    localUserIds[0] === userId
  );
}

export type OwnedStripeCustomer = {
  id: string;
  legacyBindingRepaired: boolean;
};

/**
 * Resolve and, when provably safe, repair a Stripe customer for this tenant.
 * Cross-tenant, ambiguous, deleted, or email-mismatched references are never
 * reused; callers must create a newly bound customer instead.
 */
export async function resolveOwnedStripeCustomer(
  input: {
    customerId: string;
    userId: string;
    authenticatedEmail: string;
    metadata?: Record<string, string>;
  },
  dependencies: CustomerBindingDependencies = defaultDependencies,
): Promise<OwnedStripeCustomer | null> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await dependencies.retrieve(input.customerId);
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
  if ("deleted" in customer && customer.deleted) return null;

  const boundUserId = customer.metadata?.wireline_user_id?.trim();
  if (boundUserId && boundUserId !== input.userId) return null;

  let repairLegacyBinding = false;
  if (!boundUserId) {
    const localUserIds = await dependencies.localUserIds(input.customerId);
    repairLegacyBinding = canRepairLegacyStripeCustomerBinding(
      customer,
      input.userId,
      input.authenticatedEmail,
      localUserIds,
    );
    if (!repairLegacyBinding) return null;
  }

  if (repairLegacyBinding || Object.keys(input.metadata || {}).length > 0) {
    let updated: Stripe.Customer | Stripe.DeletedCustomer;
    try {
      updated = await dependencies.update(input.customerId, {
        wireline_user_id: input.userId,
        ...(input.metadata || {}),
      });
    } catch (error) {
      if (isMissingStripeResource(error)) return null;
      throw error;
    }
    if (
      ("deleted" in updated && updated.deleted) ||
      updated.metadata?.wireline_user_id?.trim() !== input.userId
    ) {
      return null;
    }
  }

  return { id: input.customerId, legacyBindingRepaired: repairLegacyBinding };
}
