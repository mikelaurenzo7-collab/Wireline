import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  conflictTargets: [] as unknown[],
  tenants: [] as Array<string | undefined>,
  exited: 0,
}));

vi.mock("../src/lib/server-context", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const store = new AsyncLocalStorage<string>();
  const tx = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return {
          onConflictDoNothing: async (opts: { target: unknown }) => {
            h.conflictTargets.push(opts.target);
          },
        };
      },
    }),
  };
  return {
    drizzle: {
      transaction: async (fn: (t: typeof tx) => Promise<void>) => {
        h.tenants.push(store.getStore());
        await fn(tx);
      },
    },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    tenantStore: {
      run: (id: string, fn: () => unknown) => store.run(id, fn),
      exit: (fn: () => unknown) => {
        h.exited += 1;
        return store.exit(fn);
      },
      getStore: () => store.getStore(),
    },
  };
});

const { recordCarrierOptOutFromRejectedSend, TWILIO_UNSUBSCRIBED_RECIPIENT } =
  await import("../src/lib/twilio-service");

beforeEach(() => {
  h.inserted = [];
  h.conflictTargets = [];
  h.tenants = [];
  h.exited = 0;
});

describe("carrier opt-out learned from a refused send", () => {
  it("writes the same row an SMS STOP writes, so a later START clears it", async () => {
    await expect(recordCarrierOptOutFromRejectedSend("tenant-1", "+13125550102")).resolves.toBe(
      true,
    );
    expect(h.inserted).toEqual([
      expect.objectContaining({
        userId: "tenant-1",
        reason: "opt-out",
        source: "sms_opt_out",
        phoneRaw: "+13125550102",
      }),
    ]);
    // Tenant-scoped, and independent of any request transaction.
    expect(h.tenants).toEqual(["tenant-1"]);
    expect(h.exited).toBe(1);
    expect(h.conflictTargets).toHaveLength(1);
  });

  it("writes nothing without a tenant or a usable number", async () => {
    await expect(recordCarrierOptOutFromRejectedSend("", "+13125550102")).resolves.toBe(false);
    await expect(recordCarrierOptOutFromRejectedSend("tenant-1", "")).resolves.toBe(false);
    expect(h.inserted).toEqual([]);
  });

  it("is used only for an SMS refused with Twilio error 21610, after the refund", () => {
    expect(TWILIO_UNSUBSCRIBED_RECIPIENT).toBe(21610);
    const service = readFileSync(resolve(process.cwd(), "src/lib/twilio-service.ts"), "utf8");
    const refund = service.indexOf('reason: "Carrier did not accept the text"');
    const guard = service.indexOf(
      'if (channel === "sms" && providerCode === TWILIO_UNSUBSCRIBED_RECIPIENT) {',
    );
    expect(refund).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(refund);
    expect(service).toContain("code: SMS_RECIPIENT_OPTED_OUT,");
  });
});
