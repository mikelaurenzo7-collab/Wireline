import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";
import { checkoutOperations } from "../src/db/security-schema";

type Billing = {
  status: string;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
  appStatus: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};
const h = vi.hoisted(() => ({
  billing: null as Billing | null,
  beforeMutation: undefined as (() => void) | undefined,
  companyLocked: false,
  billingLocked: false,
  events: [] as string[],
  predicates: [] as Array<{ sql: string; params: unknown[] }>,
  remove: vi.fn(),
  deleteLine: vi.fn(),
  billingReadError: false,
  pendingCheckout: false,
  pendingOperation: false,
  provider: vi.fn(),
}));
const line = {
  id: 42n,
  userId: "tenant-owned",
  agentId: "agent-owned",
  phoneNumber: "+13125550100",
  vapiNumberId: `PN${"a".repeat(32)}`,
};
const cutoff = new Date("2026-09-01T04:30:00Z");
const previousEnd = new Date("2026-08-01T00:00:00Z");

vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn() },
  drizzle: {
    select: () => {
      let table: unknown;
      let joined: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        innerJoin(value: unknown) {
          joined = value;
          return query;
        },
        where(value: Parameters<PgDialect["sqlToQuery"]>[0]) {
          if (table === schema.subscriptions && joined) {
            h.predicates.push(new PgDialect().sqlToQuery(value));
          }
          return query;
        },
        limit: () => query,
        for(mode: string) {
          expect(table).toBe(schema.subscriptions);
          expect(joined).toBe(schema.settings);
          expect(mode).toBe("update");
          expect(h.companyLocked).toBe(true);
          h.billingLocked = true;
          h.events.push("lock-billing");
          return query;
        },
        then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          if (table === schema.subscriptions) {
            if (h.billingReadError && joined)
              return Promise.reject(new Error("read failed")).then(resolve, reject);
            if (joined) expect(h.billingLocked).toBe(true);
            return Promise.resolve(
              h.billing
                ? [
                    {
                      ...h.billing,
                      customerId: h.billing.stripeCustomerId,
                      subscriptionId: h.billing.stripeSubscriptionId,
                    },
                  ]
                : [],
            ).then(resolve, reject);
          }
          if (table === checkoutOperations)
            return Promise.resolve(h.pendingCheckout ? [{ id: "checkout-pending" }] : []).then(
              resolve,
              reject,
            );
          if (table === schema.accountOperationLeases)
            return Promise.resolve(h.pendingOperation ? [{ id: "billing-pending" }] : []).then(
              resolve,
              reject,
            );
          return Promise.resolve(table === schema.phoneNumbers ? [{ ...line }] : []).then(
            resolve,
            reject,
          );
        },
      };
      return query;
    },
    delete: () => ({ where: h.deleteLine }),
  },
}));
vi.mock("../src/lib/company-identity-mutation", async () => {
  const { drizzle } = await import("../src/lib/server-context");
  return {
    runCompanyIdentityMutation: async (
      _userId: string,
      _reason: string,
      operation: (tx: typeof drizzle) => Promise<unknown>,
    ) => {
      h.beforeMutation?.();
      h.companyLocked = true;
      h.events.push("lock-company");
      try {
        return await operation(drizzle);
      } finally {
        h.events.push("unlock");
        h.billingLocked = false;
        h.companyLocked = false;
      }
    },
  };
});
vi.mock("../src/lib/agent-phone-lines", () => ({ isTwilioPhoneNumberSid: () => true }));
vi.mock("../src/lib/voice/native-phone-carrier", () => ({ resolveOwnedTwilioNumberSid: vi.fn() }));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({ incomingPhoneNumbers: () => ({ remove: h.remove }) }),
}));
vi.mock("../src/lib/stripe-helpers", () => ({ stripeAllowsCanceledNumberReclamation: h.provider }));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => ({
    performed: true,
    result: await perform(),
  }),
}));

import { releaseNativeTenantNumber } from "../src/lib/voice/native-phone-release";
import { resetDistributedLeasesForTests } from "../src/lib/distributed-lease";
import { withStripeSubscriptionSyncLease } from "../src/lib/stripe-subscription-sync-lease";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetDistributedLeasesForTests();
  h.billing = {
    status: "canceled",
    currentPeriodEnd: previousEnd,
    updatedAt: previousEnd,
    appStatus: "canceled",
    stripeCustomerId: "cus_owned",
    stripeSubscriptionId: "sub_canceled",
  };
  h.beforeMutation = undefined;
  h.companyLocked = false;
  h.billingLocked = false;
  h.billingReadError = false;
  h.events = [];
  h.predicates = [];
  h.pendingCheckout = false;
  h.pendingOperation = false;
  h.provider.mockImplementation(async () => {
    expect(h.billingLocked).toBe(true);
    h.events.push("verify-stripe");
    return true;
  });
  h.remove.mockImplementation(async () => {
    expect(h.companyLocked).toBe(true);
    h.events.push("carrier-release");
  });
  h.deleteLine.mockImplementation(async () => {
    expect(h.companyLocked).toBe(true);
    h.events.push("delete-line");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canceled-number reclamation inside the release transaction", () => {
  it.each([
    { status: "active" },
    { status: "past_due" },
    { appStatus: "active" },
    { currentPeriodEnd: new Date("2026-10-01T00:00:00Z") },
    { stripeCustomerId: "cus_replaced" },
    { stripeSubscriptionId: "sub_replaced" },
  ])(
    "preserves a number when billing changes while waiting for the identity lock: %o",
    async (change) => {
      h.beforeMutation = () => Object.assign(h.billing!, change);
      const result = await releaseNativeTenantNumber(line.userId, line.phoneNumber, {
        reclaimCanceledBefore: cutoff,
      });
      expect(result).toEqual({ ok: false, skipped: true });
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.deleteLine).not.toHaveBeenCalled();
    },
  );

  it("locks both joined billing rows and retains the lock through carrier and local deletion", async () => {
    h.remove.mockImplementation(async () => {
      expect(h.billingLocked).toBe(true);
      h.events.push("carrier-release");
    });
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toEqual({ ok: true });
    expect(h.events).toEqual([
      "lock-company",
      "lock-billing",
      "verify-stripe",
      "carrier-release",
      "delete-line",
      "unlock",
    ]);
    expect(h.predicates).toEqual([
      expect.objectContaining({
        sql: '"wireline_subscriptions"."user_id" = $1',
        params: [line.userId],
      }),
    ]);
  });

  it("preserves the line when its billing row disappeared before the locked read", async () => {
    h.beforeMutation = () => {
      h.billing = null;
    };
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toEqual({ ok: false, skipped: true });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.deleteLine).not.toHaveBeenCalled();
  });

  it("fails safely before the provider when the locked billing read fails", async () => {
    h.billingReadError = true;
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toMatchObject({ ok: false });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.deleteLine).not.toHaveBeenCalled();
  });

  it("retains the legacy updated-at grace anchor when period end and app status are null", async () => {
    Object.assign(h.billing!, { currentPeriodEnd: null, appStatus: null });
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toEqual({ ok: true });
    expect(h.remove).toHaveBeenCalledOnce();
  });

  it("preserves an active customer's explicit manual release without a reclamation check", async () => {
    h.billing!.status = "active";
    await expect(releaseNativeTenantNumber(line.userId, line.phoneNumber)).resolves.toEqual({
      ok: true,
    });
    expect(h.predicates).toEqual([]);
    expect(h.remove).toHaveBeenCalledOnce();
    expect(h.provider).not.toHaveBeenCalled();
  });

  it("retains the line when reactivation already owns the shared sync lease, without locking billing", async () => {
    await withStripeSubscriptionSyncLease("cus_owned", async () => {
      await expect(
        releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
      ).rejects.toMatchObject({ status: 503 });
    });
    expect(h.events).toEqual([]);
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("retains a canceled local snapshot when Stripe reveals reactivation after the billing rows lock", async () => {
    h.provider.mockImplementationOnce(async () => {
      expect(h.billingLocked).toBe(true);
      await expect(withStripeSubscriptionSyncLease("cus_owned", vi.fn())).rejects.toMatchObject({
        status: 503,
      });
      return false;
    });
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toEqual({ ok: false, skipped: true });
    expect(h.provider).toHaveBeenCalledExactlyOnceWith({
      customerId: "cus_owned",
      subscriptionId: "sub_canceled",
      canceledBefore: cutoff,
    });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.deleteLine).not.toHaveBeenCalled();
  });

  it.each(["pendingCheckout", "pendingOperation"] as const)(
    "retains the line while %s can still reactivate billing",
    async (pending) => {
      h[pending] = true;
      await expect(
        releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
      ).resolves.toEqual({ ok: false, skipped: true });
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.remove).not.toHaveBeenCalled();
    },
  );

  it("rechecks checkout work that appeared during the provider verification", async () => {
    h.provider.mockImplementationOnce(async () => {
      h.pendingCheckout = true;
      return true;
    });
    await expect(
      releaseNativeTenantNumber(line.userId, line.phoneNumber, { reclaimCanceledBefore: cutoff }),
    ).resolves.toEqual({ ok: false, skipped: true });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it.each(["provider failure", "lease loss"])(
    "retains the line after %s at the final boundary",
    async (failure) => {
      h.provider.mockImplementationOnce(async () => {
        if (failure === "provider failure") throw new Error("Stripe unavailable");
        resetDistributedLeasesForTests();
        return true;
      });
      const result = releaseNativeTenantNumber(line.userId, line.phoneNumber, {
        reclaimCanceledBefore: cutoff,
      });
      if (failure === "provider failure")
        await expect(result).resolves.toMatchObject({ ok: false });
      else await expect(result).rejects.toMatchObject({ status: 503 });
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.deleteLine).not.toHaveBeenCalled();
    },
  );
});
