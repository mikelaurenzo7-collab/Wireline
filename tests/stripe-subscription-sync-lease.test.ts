import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({ log: { warn: vi.fn() } }));
import {
  acquireDistributedLease,
  resetDistributedLeasesForTests,
} from "../src/lib/distributed-lease";
import { withStripeSubscriptionSyncLease } from "../src/lib/stripe-subscription-sync-lease";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetDistributedLeasesForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Stripe synchronization lease boundaries", () => {
  it("serializes the same customer while allowing a different customer to progress", async () => {
    const entered = deferred();
    const proceed = deferred();
    const first = withStripeSubscriptionSyncLease("cus_one", async () => {
      entered.resolve();
      await proceed.promise;
      return "first";
    });
    await entered.promise;
    try {
      const blockedWork = vi.fn();
      await expect(withStripeSubscriptionSyncLease("cus_one", blockedWork)).rejects.toMatchObject({
        status: 503,
      });
      expect(blockedWork).not.toHaveBeenCalled();
      await expect(
        withStripeSubscriptionSyncLease("cus_two", async () => "independent"),
      ).resolves.toBe("independent");
    } finally {
      proceed.resolve();
      await expect(first).resolves.toBe("first");
    }
    await expect(withStripeSubscriptionSyncLease("cus_one", async () => "retry")).resolves.toBe(
      "retry",
    );
  });

  it("releases ownership after an error without swallowing the original failure", async () => {
    await expect(
      withStripeSubscriptionSyncLease("cus_one", async () => {
        throw new Error("Provider failed");
      }),
    ).rejects.toThrow("Provider failed");
    await expect(withStripeSubscriptionSyncLease("cus_one", async () => "retry")).resolves.toBe(
      "retry",
    );
  });

  it("fails closed without a distributed backend in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const perform = vi.fn();
    await expect(withStripeSubscriptionSyncLease("cus_one", perform)).rejects.toMatchObject({
      status: 503,
    });
    expect(perform).not.toHaveBeenCalled();
  });

  it("refuses writes after losing ownership and cannot release its replacement", async () => {
    const write = vi.fn();
    let replacement: Awaited<ReturnType<typeof acquireDistributedLease>> | undefined;
    await expect(
      withStripeSubscriptionSyncLease("cus_one", async (assertOwned) => {
        resetDistributedLeasesForTests();
        replacement = await acquireDistributedLease("stripe:subscription-sync:cus_one", 900_000);
        expect(replacement.status).toBe("acquired");
        await assertOwned();
        write();
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(write).not.toHaveBeenCalled();
    await expect(withStripeSubscriptionSyncLease("cus_one", write)).rejects.toMatchObject({
      status: 503,
    });
    if (replacement?.status === "acquired") await replacement.lease.release();
  });

  it("renews a long-running request and stops its heartbeat after completion", async () => {
    vi.useFakeTimers();
    const entered = deferred();
    const proceed = deferred();
    const running = withStripeSubscriptionSyncLease("cus_one", async (assertOwned) => {
      entered.resolve();
      await proceed.promise;
      await assertOwned();
    });
    await entered.promise;
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    await expect(withStripeSubscriptionSyncLease("cus_one", vi.fn())).rejects.toMatchObject({
      status: 503,
    });
    proceed.resolve();
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });
});
