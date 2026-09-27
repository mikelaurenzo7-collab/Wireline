import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Query = { text: string; values: unknown[] };
const h = vi.hoisted(() => ({
  plan: "voice",
  status: "active",
  lines: [] as Row[],
  pending: [] as Row[],
  acquisitions: [] as Array<{ userId: string; operationId: string; createdAt: Date }>,
  rejections: [] as Array<{ userId: string; operationId: string }>,
  failAcquisitionWrite: false,
  failRejectionWrite: false,
  failClaimWrite: false,
  beforeLock: undefined as undefined | (() => void),
  tail: Promise.resolve(),
  locked: false,
  create: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
  and:
    (...predicates: Array<(row: Row) => boolean>) =>
    (row: Row) =>
      predicates.every((p) => p(row)),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ text: parts.join("?"), values }),
}));
vi.mock("../src/db/schema", () => ({
  users: { table: "users", id: "id", email: "email" },
  subscriptions: { userId: "userId", plan: "plan", status: "status" },
  settings: {
    table: "settings",
    userId: "userId",
    extraAgents: "extraAgents",
    subscriptionStatus: "status",
  },
  agents: { table: "agents", id: "id", userId: "userId" },
  phoneNumbers: {
    table: "phones",
    phoneNumber: "phoneNumber",
    agentId: "agentId",
    userId: "userId",
  },
}));
vi.mock("../src/lib/server-context", () => {
  const select = (fields: Record<string, string>) => {
    let table = "";
    let predicate = (_row: Row) => true;
    const rows = () => {
      expect(h.locked).toBe(true);
      const data =
        table === "users"
          ? [{ id: "tenant", email: "customer@example.com", plan: h.plan, status: h.status }]
          : table === "settings"
            ? [{ userId: "tenant", extraAgents: 0, status: h.status }]
            : table === "agents"
              ? [
                  { id: "bot-a", userId: "tenant" },
                  { id: "bot-b", userId: "tenant" },
                  { id: "foreign", userId: "other" },
                ]
              : h.lines;
      return data
        .filter(predicate)
        .map((row) =>
          Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, row[field]])),
        );
    };
    const query = {
      from(value: { table: string }) {
        table = value.table;
        return query;
      },
      leftJoin() {
        return query;
      },
      where(value: typeof predicate) {
        predicate = value;
        return query;
      },
      limit(value: number) {
        return Promise.resolve(rows().slice(0, value));
      },
      then(resolve: (value: Row[]) => unknown) {
        return Promise.resolve(rows()).then(resolve);
      },
    };
    return query;
  };
  const execute = async (query: Query) => {
    if (query.text.includes("SELECT acquisition.idempotency_key")) {
      expect(h.locked).toBe(true);
      const [windowDays, userId] = query.values;
      return {
        rows: h.acquisitions
          .filter(
            (r) =>
              r.userId === userId &&
              r.createdAt.getTime() > Date.now() - Number(windowDays) * 86400000 &&
              !h.rejections.some((v) => v.userId === r.userId && v.operationId === r.operationId),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((r) => ({
            operation_id: r.operationId,
            eligible_at: new Date(r.createdAt.getTime() + Number(windowDays) * 86400000),
          })),
      };
    }
    if (query.text.includes("INSERT INTO public.wireline_audit_log")) {
      expect(h.locked).toBe(true);
      expect(query.text).toContain("0, 0, 0, 0, 0");
      if (query.text.includes("SELECT acquisition.user_id")) {
        if (h.failRejectionWrite) throw new Error("rejection ledger unavailable");
        const [, , userId, , operationId] = query.values as string[];
        if (
          h.acquisitions.some((r) => r.userId === userId && r.operationId === operationId) &&
          !h.rejections.some((r) => r.userId === userId && r.operationId === operationId)
        ) {
          h.rejections.push({ userId, operationId });
        }
        return { rows: [] };
      }
      if (h.failAcquisitionWrite) throw new Error("acquisition ledger unavailable");
      const [userId, , , operationId] = query.values as string[];
      h.acquisitions.push({ userId, operationId, createdAt: new Date() });
      return { rows: [{ id: "acquisition" }] };
    }
    if (query.text.includes("SELECT orphan.vapi_number_id")) {
      expect(h.locked).toBe(true);
      return {
        rows: h.pending.filter(
          (row) =>
            row.userId === query.values[0] &&
            String(row.vapi_number_id).startsWith("twilio:purchase:") &&
            !h.lines.some(
              (line) => line.userId === row.userId && line.phoneNumber === row.phone_number,
            ),
        ),
      };
    }
    if (query.text.includes("SELECT phone_number")) {
      expect(h.locked).toBe(true);
      return { rows: h.pending.filter((row) => row.userId === query.values[0]) };
    }
    if (query.text.includes("INSERT INTO")) {
      expect(h.locked).toBe(true);
      if (h.failClaimWrite) throw new Error("claim ledger unavailable");
      const [userId, phone_number, vapi_number_id, last_error] = query.values;
      if (h.pending.some((row) => row.userId === userId && row.phone_number === phone_number))
        return { rows: [] };
      h.pending.push({ userId, phone_number, vapi_number_id, last_error });
      return { rows: [{ id: "claim" }] };
    }
    if (query.text.includes("UPDATE")) {
      const [last_error, userId, phone_number, vapi_number_id] = query.values;
      const row = h.pending.find(
        (p) =>
          p.userId === userId &&
          p.phone_number === phone_number &&
          p.vapi_number_id === vapi_number_id,
      );
      if (row) row.last_error = last_error;
      return { rows: row ? [{ id: "claim" }] : [] };
    }
    if (query.text.includes("DELETE")) {
      const [userId, phone_number, vapi_number_id] = query.values;
      h.pending = h.pending.filter(
        (p) =>
          !(
            p.userId === userId &&
            p.phone_number === phone_number &&
            p.vapi_number_id === vapi_number_id
          ),
      );
      return { rows: [] };
    }
    throw new Error(`Unexpected statement: ${query.text}`);
  };
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    drizzle: {
      execute,
      select: () => {
        throw new Error("Admission must use its transaction executor");
      },
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        let release: undefined | (() => void);
        let snapshot:
          | undefined
          | {
              pending: Row[];
              acquisitions: typeof h.acquisitions;
              rejections: typeof h.rejections;
            };
        const tx = {
          select,
          execute,
          acquire: async () => {
            const previous = h.tail;
            h.tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            h.locked = true;
            snapshot = {
              pending: h.pending.map((r) => ({ ...r })),
              acquisitions: [...h.acquisitions],
              rejections: [...h.rejections],
            };
            const beforeLock = h.beforeLock;
            h.beforeLock = undefined;
            beforeLock?.();
          },
        };
        try {
          const result = await callback(tx);
          for (const row of h.pending) row.committed = true;
          return result;
        } catch (error) {
          if (snapshot) Object.assign(h, snapshot);
          throw error;
        } finally {
          h.locked = false;
          release?.();
        }
      },
    },
  };
});
vi.mock("../src/lib/company-identity-mutation", () => ({
  acquireCompanyIdentityMutationLock: async (
    tx: { acquire: () => Promise<void> },
    userId: string,
  ) => {
    expect(userId).toBe("tenant");
    await tx.acquire();
  },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true, environment: "production" }),
}));
vi.mock("../src/lib/channel-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/channel-entitlements")>()),
  // Authorization happens before inventory; admission must independently read
  // fresh billing on the locked transaction, even if this snapshot is stale.
  requireTenantPhoneChannel: async () => ({ channels: ["voice"] }),
}));
vi.mock("../src/lib/agent-phone-lines", () => ({
  isTwilioPhoneNumberSid: (value: string) => /^PN[0-9a-f]{32}$/.test(value),
}));
vi.mock("../src/lib/app-url", () => ({ getCanonicalAppUrl: () => "https://botbound.app" }));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({
    incomingPhoneNumbers: Object.assign(() => ({ remove: h.remove }), {
      create: h.create,
      list: h.list,
    }),
    availablePhoneNumbers: () => ({
      local: {
        list: async ({ contains }: { contains: string }) => [
          {
            phoneNumber: contains.slice(0, -1),
            isoCountry: "US",
            capabilities: { voice: true, sms: true },
          },
        ],
      },
    }),
  }),
}));

import {
  purchaseNativeNumber,
  releasePurchasedNativeNumber,
} from "../src/lib/voice/native-phone-carrier";
import {
  assertNoPendingNativeTwilioPurchaseForBot,
  clearNativeTwilioPurchaseClaim,
} from "../src/lib/orphan-carrier-ledger";
import { acquireCompanyIdentityMutationLock } from "../src/lib/company-identity-mutation";
import { drizzle } from "../src/lib/server-context";

const purchase = (suffix = "01", agentId?: string) =>
  purchaseNativeNumber({
    userId: "tenant",
    preferredPhoneNumber: `+131255501${suffix}`,
    ...(agentId ? { agentId } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  h.plan = "voice";
  h.status = "active";
  h.lines = [];
  h.pending = [];
  h.acquisitions = [];
  h.rejections = [];
  h.failAcquisitionWrite = false;
  h.failRejectionWrite = false;
  h.failClaimWrite = false;
  h.beforeLock = undefined;
  h.tail = Promise.resolve();
  h.locked = false;
  h.create.mockReset().mockImplementation(async ({ phoneNumber }: { phoneNumber: string }) => {
    expect(h.pending.find((row) => row.phone_number === phoneNumber)?.committed).toBe(true);
    return { sid: `PN${"a".repeat(32)}`, phoneNumber };
  });
  h.list.mockReset().mockResolvedValue([]);
  h.remove.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("paid carrier purchase admission", () => {
  it("admits only one different-number purchase for one slot before either provider outcome", async () => {
    const results = await Promise.allSettled([purchase("01"), purchase("02")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "PHONE_CAPACITY_REACHED" },
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.pending).toHaveLength(1);
  });

  it("reserves a Bot as well as a slot when the legacy plan has multiple numbers", async () => {
    h.plan = "team";
    const results = await Promise.allSettled([purchase("01", "bot-a"), purchase("02", "bot-a")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "PHONE_PURCHASE_PENDING" },
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    await expect(purchase("03", "bot-b")).resolves.toMatchObject({ phoneNumber: "+13125550103" });
  });

  it.each(["canceled", "past_due", "trialing"])(
    "re-reads %s billing under the lock before buying",
    async (status) => {
      h.beforeLock = () => {
        h.status = status;
      };
      await expect(purchase()).rejects.toMatchObject({ code: "PHONE_CAPACITY_REACHED" });
      expect(h.create).not.toHaveBeenCalled();
      expect(h.pending).toHaveLength(0);
    },
  );

  it("does not buy after the plan changes to Email while waiting for the lock", async () => {
    h.beforeLock = () => {
      h.plan = "email";
    };
    await expect(purchase()).rejects.toMatchObject({ code: "PHONE_CAPACITY_REACHED" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("verifies the target belongs to this tenant before any carrier mutation", async () => {
    await expect(purchase("01", "foreign")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("does not buy a second line for a Bot already assigned one", async () => {
    h.plan = "team";
    h.lines = [{ userId: "tenant", phoneNumber: "+13125550109", agentId: "bot-a" }];
    await expect(purchase("01", "bot-a")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous purchase reserved across later attempts, even after its lease age", async () => {
    h.create.mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }));
    await expect(purchase()).rejects.toMatchObject({ status: 503 });
    expect(String(h.pending[0].last_error)).toContain("provider_outcome_ambiguous");
    h.pending[0].created_at = new Date(0);
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_CAPACITY_REACHED" });
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("allows a new attempt only after a definite rejection clears the old claim", async () => {
    h.create.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 400 }));
    await expect(purchase()).rejects.toMatchObject({ status: 409 });
    expect(h.pending).toHaveLength(0);
    await expect(purchase("02")).resolves.toMatchObject({ phoneNumber: "+13125550102" });
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.acquisitions).toHaveLength(2);
    expect(h.rejections).toHaveLength(1);
  });

  it("does not double-count a claim after canonical ownership is durable", async () => {
    h.plan = "team";
    const bought = await purchase("01", "bot-a");
    h.lines = [{ userId: "tenant", phoneNumber: bought.phoneNumber, agentId: "bot-a" }];
    await expect(purchase("02", "bot-b")).resolves.toMatchObject({ phoneNumber: "+13125550102" });
    expect(h.create).toHaveBeenCalledTimes(2);
    await clearNativeTwilioPurchaseClaim(bought.claim);
    expect(h.pending).toHaveLength(1);
  });

  it("keeps generic unresolved carrier allocations inside the paid slot limit", async () => {
    h.pending = [
      {
        userId: "tenant",
        phone_number: "+13125550109",
        vapi_number_id: `PN${"b".repeat(32)}`,
        last_error: "release timed out",
      },
    ];
    await expect(purchase()).rejects.toMatchObject({ code: "PHONE_CAPACITY_REACHED" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("blocks unattributed legacy purchase claims from buying a second line for the same unknown Bot", async () => {
    h.plan = "team";
    const first = await purchase("01");
    await expect(purchase("02", "bot-a")).rejects.toMatchObject({ code: "PHONE_PURCHASE_PENDING" });
    expect(h.create).toHaveBeenCalledTimes(1);
    await clearNativeTwilioPurchaseClaim(first.claim);
    await expect(purchase("02", "bot-a")).resolves.toMatchObject({ phoneNumber: "+13125550102" });
  });
});

describe("durable phone acquisition allowance", () => {
  it("blocks buy-release-rebuy even after canonical ownership and its cleanup claim disappear", async () => {
    const first = await purchase();
    h.lines = [{ userId: "tenant", phoneNumber: first.phoneNumber, agentId: "bot-a" }];
    await clearNativeTwilioPurchaseClaim(first.claim);
    h.lines = []; // Successful DELETE retires ownership; its paid acquisition remains.
    await expect(purchase("02")).rejects.toMatchObject({
      code: "PHONE_ACQUISITION_LIMIT",
      details: { eligible_at: "2026-10-28T12:00:00.000Z" },
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.acquisitions).toHaveLength(1);
  });

  it("retains the allowance charge after accepted-purchase compensation", async () => {
    const first = await purchase();
    await releasePurchasedNativeNumber({
      userId: "tenant",
      purchase: first,
      cause: "persistence failed",
    });
    expect(h.pending).toHaveLength(0);
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_ACQUISITION_LIMIT" });
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("retains ambiguous attempts even when later reconciliation confirms no current allocation", async () => {
    h.create.mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }));
    await expect(purchase()).rejects.toMatchObject({ status: 503 });
    h.pending = []; // Janitor cleanup is not evidence of an acquisition-fee refund.
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_ACQUISITION_LIMIT" });
    expect(h.rejections).toHaveLength(0);
  });

  it("keeps a recovered accepted purchase counted", async () => {
    h.create.mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }));
    h.list.mockImplementation(async () => [
      {
        sid: `PN${"a".repeat(32)}`,
        phoneNumber: "+13125550101",
        friendlyName: h.create.mock.calls[0][0].friendlyName,
      },
    ]);
    const first = await purchase();
    await clearNativeTwilioPurchaseClaim(first.claim);
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_ACQUISITION_LIMIT" });
    expect(h.rejections).toHaveLength(0);
  });

  it("fails before the carrier if acquisition history cannot be written", async () => {
    h.failAcquisitionWrite = true;
    await expect(purchase()).rejects.toMatchObject({ status: 503 });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.pending).toHaveLength(0);
  });

  it("rolls back the acquisition receipt if the paired pending claim cannot commit", async () => {
    h.failClaimWrite = true;
    await expect(purchase()).rejects.toMatchObject({ status: 503 });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.acquisitions).toHaveLength(0);
  });

  it("does not refund a definite rejection unless its append-only void is durable", async () => {
    h.failRejectionWrite = true;
    h.create.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 400 }));
    await expect(purchase()).rejects.toMatchObject({ status: 503 });
    expect(h.pending).toHaveLength(1);
    expect(h.rejections).toHaveLength(0);
    h.pending = [];
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_ACQUISITION_LIMIT" });
  });

  it("opens one new acquisition exactly after the 31-day window", async () => {
    const first = await purchase();
    await clearNativeTwilioPurchaseClaim(first.claim);
    vi.setSystemTime(new Date("2026-10-28T11:59:59.999Z"));
    await expect(purchase("02")).rejects.toMatchObject({ code: "PHONE_ACQUISITION_LIMIT" });
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    await expect(purchase("02")).resolves.toMatchObject({ phoneNumber: "+13125550102" });
  });

  it("uses the later expiry when a downgraded plan has fewer slots than recent acquisitions", async () => {
    h.plan = "team";
    const first = await purchase("01");
    await clearNativeTwilioPurchaseClaim(first.claim);
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    const second = await purchase("02");
    await clearNativeTwilioPurchaseClaim(second.claim);
    h.plan = "voice";
    await expect(purchase("03")).rejects.toMatchObject({
      code: "PHONE_ACQUISITION_LIMIT",
      details: { eligible_at: "2026-10-29T12:00:00.000Z" },
    });
  });
});

describe("pending purchase Bot-assignment fence", () => {
  const assertAssignable = (agentId: string) =>
    drizzle.transaction(async (tx) => {
      await acquireCompanyIdentityMutationLock(tx, "tenant");
      await assertNoPendingNativeTwilioPurchaseForBot(tx, "tenant", agentId);
    });

  it("blocks another assignment for the purchasing Bot but permits other Bots", async () => {
    h.plan = "team";
    await purchase("01", "bot-a");
    await expect(assertAssignable("bot-a")).rejects.toMatchObject({
      code: "PHONE_PURCHASE_PENDING",
    });
    await expect(assertAssignable("bot-b")).resolves.toBeUndefined();
  });

  it("preserves canonical recovery when an old claim could not be cleared", async () => {
    const first = await purchase("01", "bot-a");
    h.lines = [{ userId: "tenant", phoneNumber: first.phoneNumber, agentId: "bot-a" }];
    await expect(assertAssignable("bot-a")).resolves.toBeUndefined();
  });

  it("fails closed for unresolved claims without a trustworthy Bot attribution", async () => {
    await purchase();
    await expect(assertAssignable("bot-a")).rejects.toMatchObject({
      code: "PHONE_PURCHASE_PENDING",
    });
    h.pending[0].last_error = "malformed";
    await expect(assertAssignable("bot-b")).rejects.toMatchObject({
      code: "PHONE_PURCHASE_PENDING",
    });
  });
});
