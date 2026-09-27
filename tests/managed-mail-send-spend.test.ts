import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ reserve: vi.fn(), commit: vi.fn(), ambiguous: vi.fn() }));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: h.reserve,
  commitPlatformCostReservation: h.commit,
  markPlatformCostReservationAmbiguous: h.ambiguous,
}));

import { sendFundedManagedEmail } from "../src/lib/managed-mail-send-spend";

beforeEach(() => {
  vi.clearAllMocks();
  h.reserve.mockImplementation(async (input) => ({
    reserved: true,
    reservation: { userId: input.userId, auditId: 1n, costUsd: input.costUsd, adopted: false },
  }));
  h.commit.mockResolvedValue(undefined);
  h.ambiguous.mockResolvedValue(undefined);
});

describe("managed email attempt funding", () => {
  it.each(["cap_reached", "unavailable"])("never opens a transport when %s", async (reason) => {
    h.reserve.mockResolvedValue({ reserved: false, reason });
    const perform = vi.fn();
    expect(
      await sendFundedManagedEmail({ userId: "tenant-a", provider: "agentmail", perform }),
    ).toBe(false);
    expect(perform).not.toHaveBeenCalled();
  });

  it.each(["agentmail", "resend"] as const)(
    "reserves before %s delivery and commits acceptance",
    async (provider) => {
      const perform = vi.fn(async () => {
        expect(h.reserve).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "tenant-a",
            provider,
            action: "platform.email.send",
            costUsd: 0.002,
          }),
        );
        expect(h.commit).not.toHaveBeenCalled();
        return true;
      });
      expect(await sendFundedManagedEmail({ userId: "tenant-a", provider, perform })).toBe(true);
      expect(h.commit).toHaveBeenCalledOnce();
      expect(h.ambiguous).not.toHaveBeenCalled();
    },
  );

  it("retains the debit when SMTP cannot prove delivery", async () => {
    expect(
      await sendFundedManagedEmail({
        userId: "tenant-a",
        provider: "agentmail",
        perform: async () => false,
      }),
    ).toBe(false);
    expect(h.ambiguous).toHaveBeenCalledOnce();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("retains the debit after a thrown timeout and gives each retry its own reservation", async () => {
    const perform = vi.fn(async () => {
      throw new Error("socket timeout");
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        sendFundedManagedEmail({ userId: "tenant-a", provider: "agentmail", perform }),
      ).rejects.toThrow("socket timeout");
    }
    expect(h.reserve).toHaveBeenCalledTimes(2);
    expect(h.ambiguous).toHaveBeenCalledTimes(2);
    expect(h.reserve.mock.calls.every(([args]) => !args.idempotencyKey)).toBe(true);
  });
});
