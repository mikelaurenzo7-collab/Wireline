import { beforeEach, describe, expect, it, vi } from "vitest";

const fenceMocks = vi.hoisted(() => ({ acquire: vi.fn() }));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  tenantStore: { run: (_userId: string, work: () => unknown) => work() },
}));
vi.mock("../src/lib/account-deletion-fence", () => ({
  acquireAccountDeletionFence: fenceMocks.acquire,
}));

import { claimTerminalAccountPurge } from "../src/lib/account-deletion";

describe("terminal purge admission waits for account-operation leases", () => {
  beforeEach(() => {
    fenceMocks.acquire.mockReset();
    fenceMocks.acquire.mockResolvedValue(undefined);
  });

  it("returns the earliest active lease expiry as the retry boundary", async () => {
    const retryAt = new Date("2026-08-27T20:30:00.000Z");
    const limit = vi.fn().mockResolvedValue([{ expiresAt: retryAt }]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const tx = { select: vi.fn(() => ({ from })) };
    const db = {
      transaction: vi.fn((work: (executor: typeof tx) => unknown) => work(tx)),
    };

    await expect(
      claimTerminalAccountPurge(
        { userId: "11111111-1111-4111-8111-111111111111", queueId: "queue-1" },
        { db: db as never },
      ),
    ).resolves.toEqual({
      ready: false,
      reason: "account_operation_in_flight",
      retryAt,
    });

    expect(fenceMocks.acquire).toHaveBeenCalledWith(tx, "11111111-1111-4111-8111-111111111111");
    expect(orderBy).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
    // Admission stops before the queue row can be claimed `purging`.
    expect(tx.select).toHaveBeenCalledOnce();
  });
});
