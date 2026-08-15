import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  canRepairLegacyStripeCustomerBinding,
  resolveOwnedStripeCustomer,
  type CustomerBindingDependencies,
} from "../src/lib/stripe-customer-binding";
import { findPotentiallyLiveStripeSubscription } from "../src/lib/stripe-subscription-safety";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function customer(
  metadata: Record<string, string> = {},
  email: string | null = "owner@example.com",
): Stripe.Customer {
  return { id: "cus_legacy", email, metadata } as Stripe.Customer;
}

function dependencies(
  value: Stripe.Customer = customer(),
  localUserIds: string[] = ["user-owner"],
): CustomerBindingDependencies {
  return {
    retrieve: vi.fn(async () => value),
    localUserIds: vi.fn(async () => localUserIds),
    update: vi.fn(async (id, metadata) => ({ ...value, id, metadata }) as Stripe.Customer),
  };
}

describe("Stripe customer tenant binding", () => {
  it("repairs blank legacy metadata only with matching email and one local owner", async () => {
    const deps = dependencies();
    await expect(
      resolveOwnedStripeCustomer(
        {
          customerId: "cus_legacy",
          userId: "user-owner",
          authenticatedEmail: " OWNER@example.com ",
          metadata: { acquisition: "launch" },
        },
        deps,
      ),
    ).resolves.toEqual({ id: "cus_legacy", legacyBindingRepaired: true });
    expect(deps.update).toHaveBeenCalledWith("cus_legacy", {
      wireline_user_id: "user-owner",
      acquisition: "launch",
    });
  });

  it("refuses blank metadata when email or the unique local reference disagrees", async () => {
    expect(
      canRepairLegacyStripeCustomerBinding(customer(), "user-owner", "other@example.com", [
        "user-owner",
      ]),
    ).toBe(false);
    expect(
      canRepairLegacyStripeCustomerBinding(customer(), "user-owner", "owner@example.com", [
        "user-owner",
        "user-other",
      ]),
    ).toBe(false);

    const wrongEmail = dependencies();
    await expect(
      resolveOwnedStripeCustomer(
        {
          customerId: "cus_legacy",
          userId: "user-owner",
          authenticatedEmail: "other@example.com",
        },
        wrongEmail,
      ),
    ).resolves.toBeNull();
    expect(wrongEmail.update).not.toHaveBeenCalled();

    const duplicated = dependencies(customer(), ["user-owner", "user-other"]);
    await expect(
      resolveOwnedStripeCustomer(
        {
          customerId: "cus_legacy",
          userId: "user-owner",
          authenticatedEmail: "owner@example.com",
        },
        duplicated,
      ),
    ).resolves.toBeNull();
    expect(duplicated.update).not.toHaveBeenCalled();
  });

  it("accepts an exact metadata owner and refuses a cross-tenant binding", async () => {
    const owned = dependencies(customer({ wireline_user_id: "user-owner" }, "old@example.com"));
    await expect(
      resolveOwnedStripeCustomer(
        {
          customerId: "cus_legacy",
          userId: "user-owner",
          authenticatedEmail: "new@example.com",
        },
        owned,
      ),
    ).resolves.toEqual({ id: "cus_legacy", legacyBindingRepaired: false });
    expect(owned.localUserIds).not.toHaveBeenCalled();

    const other = dependencies(customer({ wireline_user_id: "user-other" }));
    await expect(
      resolveOwnedStripeCustomer(
        {
          customerId: "cus_legacy",
          userId: "user-owner",
          authenticatedEmail: "owner@example.com",
        },
        other,
      ),
    ).resolves.toBeNull();
    expect(other.localUserIds).not.toHaveBeenCalled();
    expect(other.update).not.toHaveBeenCalled();
  });

  it("keeps both checkout implementations on the shared binding boundary", () => {
    for (const path of [
      "src/routes/launch-billing-checkout-atomic-routes.ts",
      "src/routes/launch-billing-checkout-routes.ts",
    ]) {
      const source = read(path);
      expect(source).toContain('from "../lib/stripe-customer-binding"');
      expect(source).toContain("resolveOwnedStripeCustomer({");
      expect(source).toContain("findPotentiallyLiveStripeSubscription(");
    }
  });

  it("checks legacy customer uniqueness outside tenant-scoped RLS", () => {
    const source = read("src/lib/stripe-customer-binding.ts");
    expect(source).toContain("drizzle, tenantStore");
    expect(source).toContain("tenantStore.exit(() =>");
    expect(source).toContain(".limit(2)\n        .execute()");
  });

  it("paginates the full Stripe history before allowing another subscription", async () => {
    const terminal = Array.from({ length: 100 }, (_, index) => ({
      id: `sub_terminal_${index}`,
      status: "canceled",
    })) as Stripe.Subscription[];
    const live = { id: "sub_still_live", status: "active" } as Stripe.Subscription;
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: terminal, has_more: true })
      .mockResolvedValueOnce({ data: [live], has_more: false });
    const client = { subscriptions: { list } } as unknown as Pick<Stripe, "subscriptions">;

    await expect(findPotentiallyLiveStripeSubscription("cus_history", client)).resolves.toBe(live);
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ starting_after: "sub_terminal_99", limit: 100 }),
    );
  });
});
