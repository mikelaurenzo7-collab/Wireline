import type Stripe from "stripe";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  listCustomerSubscriptionsForDeletion,
  type SubscriptionSnapshot,
} from "../src/lib/account-deletion-billing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const snapshot: SubscriptionSnapshot = {
  stripeCustomerId: "cus_stale",
  stripeSubscriptionId: "sub_primary",
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
};

function throwingList(error: unknown): AsyncIterable<Stripe.Subscription> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<Stripe.Subscription>> {
          throw error;
        },
      };
    },
  };
}

describe("account-deletion Stripe subscription inventory", () => {
  it("continues to the primary subscription when the local customer id is missing", async () => {
    const primary = {
      id: "sub_primary",
      status: "active",
      cancel_at_period_end: false,
    } as Stripe.Subscription;
    const retrieve = vi.fn(async () => primary);
    const client = {
      subscriptions: {
        list: vi.fn(() => throwingList({ code: "resource_missing" })),
        retrieve,
      },
    } as unknown as Pick<Stripe, "subscriptions">;

    await expect(listCustomerSubscriptionsForDeletion(snapshot, client)).resolves.toEqual([
      primary,
    ]);
    expect(retrieve).toHaveBeenCalledWith("sub_primary");
  });

  it("keeps pagination and network failures fatal", async () => {
    const failure = new Error("Stripe page timed out");
    const retrieve = vi.fn();
    const client = {
      subscriptions: {
        list: vi.fn(() => throwingList(failure)),
        retrieve,
      },
    } as unknown as Pick<Stripe, "subscriptions">;

    await expect(listCustomerSubscriptionsForDeletion(snapshot, client)).rejects.toBe(failure);
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe("account-deletion cancellation safety", () => {
  const request = read("src/lib/account-deletion-request.ts");
  const billing = read("src/lib/account-deletion-billing.ts");
  const settingsRoute = read("src/routes/settings-routes.ts");
  const settingsPage = read("src/pages/SettingsPage.tsx");

  it("uses the same advisory fence for a new request and cancellation", () => {
    const requestBlock = request.slice(request.indexOf("export async function ensurePending"));
    const cancellationBlock = request.slice(
      request.indexOf("export async function cancelPendingAccountDeletion"),
    );
    expect(requestBlock).toContain("await acquireAccountDeletionFence(tx, input.userId)");
    expect(cancellationBlock).toContain("await acquireAccountDeletionFence(tx, input.userId)");
    expect(cancellationBlock.indexOf("await acquireAccountDeletionFence")).toBeLessThan(
      cancellationBlock.indexOf(".update(schema.deletionQueue)"),
    );
    expect(cancellationBlock).toContain(
      'inArray(schema.deletionQueue.status, ["pending", "purging"])',
    );
  });

  it("never auto-reactivates billing after cancellation", () => {
    expect(billing).not.toContain("resumeRenewalAfterDeletionCancellation");
    expect(billing).not.toContain("cancel_at_period_end: false");
    expect(settingsRoute).toContain("cancelPendingAccountDeletion");
    expect(settingsRoute).toContain("renewal_resumed: false");
    expect(settingsRoute).toContain("billing_reactivation_required: true");
    expect(settingsPage).toContain("BotBound did not restart billing automatically");
    expect(settingsPage).toContain("reactivate it explicitly");
  });
});
