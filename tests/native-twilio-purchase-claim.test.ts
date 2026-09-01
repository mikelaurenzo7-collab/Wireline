import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const PHONE_NUMBER = "+14155550123";
const PHONE_SID = `PN${"a".repeat(32)}`;

function twilioClient(input?: {
  create?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}) {
  const create = input?.create ?? vi.fn();
  const list = input?.list ?? vi.fn(async () => []);
  const remove = input?.remove ?? vi.fn(async () => undefined);
  const incomingPhoneNumbers = Object.assign(
    vi.fn(() => ({ remove })),
    { create, list },
  );
  return { client: { incomingPhoneNumbers }, create, list, remove };
}

function installCarrierMocks(input: {
  execute: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
}) {
  const provider = twilioClient({ create: input.create, list: input.list });
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { execute: input.execute },
    log,
  }));
  vi.doMock("../src/lib/twilio-service", () => ({
    getTwilioClient: () => provider.client,
  }));
  vi.doMock("../src/lib/account-environment-policy", () => ({
    liveExternalActionPolicyForUser: vi.fn(async () => ({
      allowed: true,
      environment: "production",
    })),
  }));
  vi.doMock("../src/lib/app-url", () => ({
    getCanonicalAppUrl: () => "https://botbound.me",
  }));
  return { ...provider, log };
}

function purchaseClaimRow() {
  const friendlyName = `BotBound native ${OPERATION_ID}`;
  return {
    id: "22222222-2222-4222-8222-222222222222",
    former_user_id: USER_ID,
    phone_number: PHONE_NUMBER,
    vapi_number_id: `twilio:purchase:${OPERATION_ID}`,
    last_error: `Native Twilio purchase claim:${JSON.stringify({
      operationId: OPERATION_ID,
      friendlyName,
      phase: "provider_outcome_ambiguous",
    })}`,
    created_at: new Date(0),
  };
}

function installReconciliationMocks(input: {
  execute: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}) {
  const provider = twilioClient({ list: input.list, remove: input.remove });
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { execute: input.execute },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tenantStore: { exit: <T>(callback: () => T) => callback() },
  }));
  vi.doMock("../src/lib/twilio-service", () => ({
    getTwilioClient: () => provider.client,
  }));
  vi.doMock("../src/lib/carrier-release", () => ({
    releaseCarrierAllocations: vi.fn(),
  }));
  return provider;
}

describe("native Twilio pre-provider purchase claims", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("durably claims the chosen E.164 before one provider mutation", async () => {
    const events: string[] = [];
    const execute = vi.fn(async () => {
      events.push("ledger");
      return { rows: [{ id: "claim-row" }] };
    });
    const create = vi.fn(async (fields: Record<string, unknown>) => {
      events.push("provider");
      return { sid: PHONE_SID, phoneNumber: fields.phoneNumber };
    });
    installCarrierMocks({ execute, create });
    const { purchaseNativeNumber } = await import("../src/lib/voice/native-phone-carrier");

    const result = await purchaseNativeNumber({
      userId: USER_ID,
      preferredPhoneNumber: PHONE_NUMBER,
    });

    expect(events).toEqual(["ledger", "provider", "ledger"]);
    expect(create).toHaveBeenCalledTimes(1);
    const providerFields = create.mock.calls[0]?.[0] as { friendlyName: string };
    expect(providerFields.friendlyName).toMatch(/^BotBound native [0-9a-f-]{36}$/);
    expect(providerFields.friendlyName).not.toContain(USER_ID.slice(0, 8));
    expect(result).toMatchObject({ phoneNumber: PHONE_NUMBER, sid: PHONE_SID });
    expect(result.claim.friendlyName).toBe(providerFields.friendlyName);
  });

  it("never calls Twilio when the durable pre-provider claim cannot be written", async () => {
    const execute = vi.fn(async () => {
      throw new Error("ledger unavailable");
    });
    const create = vi.fn();
    installCarrierMocks({ execute, create });
    const { purchaseNativeNumber } = await import("../src/lib/voice/native-phone-carrier");

    await expect(
      purchaseNativeNumber({ userId: USER_ID, preferredPhoneNumber: PHONE_NUMBER }),
    ).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled();
  });

  it("retains an ambiguous provider outcome and never retries the purchase", async () => {
    const execute = vi.fn(async () => ({ rows: [{ id: "claim-row" }] }));
    const create = vi.fn(async () => {
      throw Object.assign(new Error("gateway timeout"), { status: 503 });
    });
    const list = vi.fn(async () => []);
    installCarrierMocks({ execute, create, list });
    const { purchaseNativeNumber } = await import("../src/lib/voice/native-phone-carrier");

    await expect(
      purchaseNativeNumber({ userId: USER_ID, preferredPhoneNumber: PHONE_NUMBER }),
    ).rejects.toMatchObject({ status: 503 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ phoneNumber: PHONE_NUMBER, limit: 10 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("raises after provider ambiguity when the claim-state ledger update fails", async () => {
    let write = 0;
    const execute = vi.fn(async () => {
      write += 1;
      if (write === 2) throw new Error("ledger update unavailable");
      return { rows: [{ id: "claim-row" }] };
    });
    const create = vi.fn(async () => {
      throw Object.assign(new Error("gateway timeout"), { status: 503 });
    });
    installCarrierMocks({ execute, create, list: vi.fn(async () => []) });
    const { purchaseNativeNumber } = await import("../src/lib/voice/native-phone-carrier");

    await expect(
      purchaseNativeNumber({ userId: USER_ID, preferredPhoneNumber: PHONE_NUMBER }),
    ).rejects.toMatchObject({ status: 503 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retains the claim and raises when purchase compensation is ambiguous", async () => {
    const execute = vi.fn(async () => ({ rows: [{ id: "claim-row" }] }));
    const create = vi.fn(async () => ({ sid: PHONE_SID, phoneNumber: PHONE_NUMBER }));
    const mocks = installCarrierMocks({ execute, create });
    mocks.remove.mockRejectedValue(Object.assign(new Error("timeout"), { status: 503 }));
    const { purchaseNativeNumber, releasePurchasedNativeNumber } =
      await import("../src/lib/voice/native-phone-carrier");
    const purchase = await purchaseNativeNumber({
      userId: USER_ID,
      preferredPhoneNumber: PHONE_NUMBER,
    });

    await expect(
      releasePurchasedNativeNumber({ userId: USER_ID, purchase, cause: "persistence failed" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not let a generic orphan handoff overwrite an exact purchase claim", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    vi.doMock("../src/lib/server-context", () => ({ drizzle: { execute } }));
    const { recordPendingOrphanCarrierResource } = await import("../src/lib/orphan-carrier-ledger");

    await expect(
      recordPendingOrphanCarrierResource({
        userId: USER_ID,
        phoneNumber: PHONE_NUMBER,
        carrierId: PHONE_SID,
        error: "generic cleanup",
      }),
    ).rejects.toThrow("purchase claim already owns");
  });
});

describe("terminal native Twilio purchase reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists by exact E.164/friendly-name and releases acceptance before deleting the claim", async () => {
    const events: string[] = [];
    let query = 0;
    const execute = vi.fn(async () => {
      query += 1;
      events.push(`db:${query}`);
      if (query === 1) return { rows: [purchaseClaimRow()] };
      if (query === 2) return { rows: [] };
      return { rows: [] };
    });
    const list = vi.fn(async () => {
      events.push("provider:list");
      return [
        { sid: `PN${"b".repeat(32)}`, phoneNumber: PHONE_NUMBER, friendlyName: "Unrelated" },
        {
          sid: PHONE_SID,
          phoneNumber: PHONE_NUMBER,
          friendlyName: `BotBound native ${OPERATION_ID}`,
        },
      ];
    });
    const remove = vi.fn(async () => {
      events.push("provider:remove");
    });
    installReconciliationMocks({ execute, list, remove });
    const { reconcileNativeTwilioPurchaseClaimsForTerminalDeletion } =
      await import("../src/lib/orphan-carrier-retry");

    const summary = await reconcileNativeTwilioPurchaseClaimsForTerminalDeletion(USER_ID);

    expect(summary).toEqual({
      attempted: 1,
      released: 1,
      confirmedAbsent: 0,
      canonicalOwnership: 0,
    });
    expect(list).toHaveBeenCalledWith({ phoneNumber: PHONE_NUMBER, limit: 10 });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["db:1", "db:2", "provider:list", "provider:remove", "db:3"]);
  });

  it("keeps the claim and blocks terminal deletion when authoritative listing fails", async () => {
    let query = 0;
    const execute = vi.fn(async () => {
      query += 1;
      if (query === 1) return { rows: [purchaseClaimRow()] };
      return { rows: [] };
    });
    const list = vi.fn(async () => {
      throw new Error("Twilio listing unavailable");
    });
    const remove = vi.fn();
    installReconciliationMocks({ execute, list, remove });
    const { reconcileNativeTwilioPurchaseClaimsForTerminalDeletion } =
      await import("../src/lib/orphan-carrier-retry");

    await expect(reconcileNativeTwilioPurchaseClaimsForTerminalDeletion(USER_ID)).rejects.toThrow(
      "Twilio listing unavailable",
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not let the daily janitor retire a fresh in-flight purchase claim", async () => {
    const freshClaim = { ...purchaseClaimRow(), created_at: new Date() };
    const execute = vi.fn(async () => ({ rows: [freshClaim] }));
    const list = vi.fn();
    const remove = vi.fn();
    installReconciliationMocks({ execute, list, remove });
    const { retryPendingOrphanCarrierResources } = await import("../src/lib/orphan-carrier-retry");

    await expect(retryPendingOrphanCarrierResources()).resolves.toEqual({
      attempted: 0,
      resolved: 0,
      failed: 0,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("defensively skips a stale claim while its provider lease is still active", async () => {
    const staleClaim = { ...purchaseClaimRow(), created_at: new Date(0) };
    let query = 0;
    const execute = vi.fn(async () => {
      query += 1;
      if (query === 1) return { rows: [staleClaim] };
      if (query === 2) return { rows: [{ active: 1 }] };
      return { rows: [] };
    });
    const list = vi.fn();
    const remove = vi.fn();
    installReconciliationMocks({ execute, list, remove });
    const { retryPendingOrphanCarrierResources } = await import("../src/lib/orphan-carrier-retry");

    await expect(retryPendingOrphanCarrierResources()).resolves.toEqual({
      attempted: 0,
      resolved: 0,
      failed: 0,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("places authoritative claim reconciliation before canonical number teardown", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/account-deletion.ts"), "utf8");
    const reconcile = source.indexOf(
      "reconcileNativeTwilioPurchaseClaimsForTerminalDeletion(userId)",
    );
    const canonicalNumbers = source.indexOf("const numbers = await db", reconcile);
    const localPurge = source.indexOf("export async function purgeAccount", reconcile);

    expect(reconcile).toBeGreaterThan(-1);
    expect(canonicalNumbers).toBeGreaterThan(reconcile);
    expect(localPurge).toBeGreaterThan(canonicalNumbers);
    const retry = readFileSync(resolve(process.cwd(), "src/lib/orphan-carrier-retry.ts"), "utf8");
    expect(retry).toContain("wireline_account_operation_leases AS lease");
    expect(retry).toContain("lease.expires_at > now()");
    expect(retry).toContain("nativeTwilioPurchaseClaimIsStaleForJanitor(row.created_at)");
    expect(retry).toContain("hasActiveProviderOperationLease(row.former_user_id)");
    expect(retry).toContain("tenantStore.exit");
  });
});
