import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (req: any, res: any) => Promise<unknown>>,
  deletion: false,
  binding: { customerId: "cus_owner", subscriptionId: "sub_owner", planId: "voice" } as Record<
    string,
    string
  > | null,
  transaction: vi.fn(),
  select: vi.fn(),
  schedule: vi.fn(),
  release: vi.fn(),
  status: vi.fn(),
  locks: [] as string[],
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "delete"].map((method) => [
        method,
        (_path: string, ...handlers: any[]) => {
          h.handlers[method] = handlers.at(-1);
        },
      ]),
    ),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { transaction: h.transaction, select: h.select },
}));
vi.mock("../src/lib/stripe-helpers", () => ({ stripe: {}, stripeAvailable: () => true }));
vi.mock("../src/lib/stripe-capacity-upgrade", () => ({
  getCapacityUpgradeStatus: h.status,
  scheduleCapacityUpgrade: h.schedule,
  releaseOwnedCapacitySchedule: h.release,
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/launch-hard-gate", () => ({
  enforceLaunchHardGate: vi.fn(),
  enforceSelfServeBillingRelease: vi.fn(),
}));
vi.mock("../src/middleware/account-deletion-billing-fence", () => ({
  fencePayableBillingDuringAccountDeletion: vi.fn(),
}));
import "../src/routes/billing-capacity-routes";

beforeEach(() => {
  vi.clearAllMocks();
  h.deletion = false;
  h.binding = { customerId: "cus_owner", subscriptionId: "sub_owner", planId: "voice" };
  h.locks = [];
  h.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () =>
          table === schema.deletionQueue
            ? h.deletion
              ? [{ id: "pending" }]
              : []
            : h.binding
              ? [h.binding]
              : [],
      }),
    }),
  }));
  let tail = Promise.resolve();
  h.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
    let unlock: () => void = () => {};
    const tx = {
      select: h.select,
      execute: async (statement: any) => {
        const query = new PgDialect().sqlToQuery(statement);
        expect(query.sql).toContain("pg_advisory_xact_lock");
        h.locks.push(String(query.params[0]));
        const prior = tail;
        tail = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await prior;
      },
    };
    try {
      return await work(tx);
    } finally {
      unlock();
    }
  });
});
const req = () => ({ user: { id: "owner" }, body: { plan_id: "voice-regular" } });
const res = () => ({ json: vi.fn() });
describe("capacity route admission", () => {
  it("checks pending deletion under the operation lock before provider work", async () => {
    h.deletion = true;
    await expect(h.handlers.post(req(), res())).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_PENDING",
    });
    expect(h.locks).toEqual(["billing-capacity:owner"]);
    expect(h.schedule).not.toHaveBeenCalled();
  });
  it("serializes two requests and passes only the server's owned binding", async () => {
    let active = 0;
    let peak = 0;
    h.schedule.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { status: "scheduled" };
    });
    await Promise.all([h.handlers.post(req(), res()), h.handlers.post(req(), res())]);
    expect(peak).toBe(1);
    expect(h.schedule).toHaveBeenCalledWith({ userId: "owner", ...h.binding }, "voice-regular", {});
    expect(h.locks).toEqual(["billing-capacity:owner", "billing-capacity:owner"]);
  });
  it("allows removal during pending deletion without scheduling new paid work", async () => {
    h.deletion = true;
    const response = res();
    await h.handlers.delete(req(), response);
    expect(h.release).toHaveBeenCalledWith({ userId: "owner", ...h.binding }, {});
    expect(h.schedule).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ status: "removed" });
  });
  it("does not fabricate success when release confirmation fails", async () => {
    h.release.mockRejectedValueOnce(new Error("unconfirmed"));
    const response = res();
    await expect(h.handlers.delete(req(), response)).rejects.toThrow("unconfirmed");
    expect(response.json).not.toHaveBeenCalled();
  });
});
