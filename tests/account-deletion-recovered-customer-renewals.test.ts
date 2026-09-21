import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  snapshot: null as Record<string, unknown> | null,
  operations: [] as Array<Record<string, unknown>>,
  subscriptions: [] as Stripe.Subscription[],
  ownedCustomers: new Set<string>(),
  recoveredCustomers: [] as string[],
  list: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn(),
  customer: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn() },
  drizzle: {
    select: () => {
      let table: string;
      const query = {
        from: (value: Table) => {
          table = getTableName(value);
          return query;
        },
        where: () => query,
        limit: () => query,
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(
            table === "wireline_subscriptions"
              ? h.snapshot
                ? [h.snapshot]
                : []
              : table === "wireline_users"
                ? [{ email: "owner@example.test" }]
                : h.operations,
          ).then(resolve),
      };
      return query;
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("../src/lib/stripe-helpers", () => ({
  stripeAvailable: () => true,
  isMissingStripeResource: (error: { code?: string }) => error.code === "resource_missing",
  syncSubscriptionFromStripe: vi.fn(),
  stripe: {
    subscriptions: { list: h.list, retrieve: h.retrieve, update: h.update },
    customers: {
      retrieve: h.customer,
      search: () => ({
        async *[Symbol.asyncIterator]() {
          for (const id of h.recoveredCustomers) yield { id };
        },
      }),
    },
    checkout: { sessions: { list: () => ({ async *[Symbol.asyncIterator]() {} }) } },
  },
}));
vi.mock("../src/lib/stripe-customer-binding", () => ({
  resolveOwnedStripeCustomer: async ({ customerId }: { customerId: string }) =>
    h.ownedCustomers.has(customerId) ? { id: customerId } : null,
}));

import { stopRenewalForDeletion } from "../src/lib/account-deletion-billing";

const userId = "00000000-0000-4000-8000-000000000001";
function subscription(id: string, customer: string): Stripe.Subscription {
  return { id, customer, status: "active", cancel_at_period_end: false } as Stripe.Subscription;
}
beforeEach(() => {
  h.snapshot = null;
  h.operations = [];
  h.subscriptions = [];
  h.ownedCustomers.clear();
  h.recoveredCustomers = [];
  h.list.mockReset().mockImplementation(({ customer }) => ({
    async *[Symbol.asyncIterator]() {
      if (!h.ownedCustomers.has(customer)) throw { code: "resource_missing" };
      yield* h.subscriptions.filter((sub) => sub.customer === customer);
    },
  }));
  h.retrieve.mockReset().mockImplementation(async (id) => {
    const found = h.subscriptions.find((sub) => sub.id === id);
    if (!found) throw { code: "resource_missing" };
    return found;
  });
  h.update.mockReset().mockImplementation(async (id, patch) => ({
    ...h.subscriptions.find((sub) => sub.id === id),
    ...patch,
  }));
  h.customer.mockReset().mockRejectedValue({ code: "resource_missing" });
});

describe("deletion renewal closure uses recovered, verified Stripe customers", () => {
  it("stops siblings on the primary subscription's actual customer when the local customer is stale", async () => {
    h.snapshot = {
      stripeCustomerId: "cus_stale",
      stripeSubscriptionId: "sub_primary",
      currentPeriodEnd: null,
    };
    h.ownedCustomers.add("cus_actual");
    h.subscriptions = [
      subscription("sub_primary", "cus_actual"),
      subscription("sub_sibling", "cus_actual"),
    ];

    const result = await stopRenewalForDeletion(userId);

    expect(result.confirmed).toBe(true);
    expect(h.update.mock.calls.map(([id]) => id).sort()).toEqual(["sub_primary", "sub_sibling"]);
    expect(h.list).toHaveBeenCalledWith({ customer: "cus_actual", status: "all", limit: 100 });
  });

  it("closes recovered customer renewals even when no local subscription IDs remain", async () => {
    h.operations = [
      { id: "operation", stripeCustomerId: "cus_recovered", stripeCheckoutSessionId: null },
    ];
    h.ownedCustomers.add("cus_recovered");
    h.ownedCustomers.add("cus_second");
    h.recoveredCustomers = ["cus_recovered", "cus_second"];
    h.subscriptions = [
      subscription("sub_recovered", "cus_recovered"),
      subscription("sub_second", "cus_second"),
    ];

    const result = await stopRenewalForDeletion(userId);

    expect(result.confirmed).toBe(true);
    expect(h.update.mock.calls.map(([id]) => id).sort()).toEqual(["sub_recovered", "sub_second"]);
    expect(h.list.mock.calls.filter(([input]) => input.customer === "cus_recovered")).toHaveLength(
      1,
    );
  });

  it("does not confirm closure when a recovered customer's inventory fails", async () => {
    h.operations = [
      { id: "operation", stripeCustomerId: "cus_recovered", stripeCheckoutSessionId: null },
    ];
    h.ownedCustomers.add("cus_recovered");
    h.list.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error("provider unavailable");
        },
      }),
    }));

    expect((await stopRenewalForDeletion(userId)).confirmed).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("never enumerates or changes a recovered customer whose ownership cannot be verified", async () => {
    h.operations = [
      { id: "operation", stripeCustomerId: "cus_foreign", stripeCheckoutSessionId: null },
    ];
    h.customer.mockResolvedValue({ id: "cus_foreign", deleted: false });

    expect((await stopRenewalForDeletion(userId)).confirmed).toBe(false);
    expect(h.list).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
