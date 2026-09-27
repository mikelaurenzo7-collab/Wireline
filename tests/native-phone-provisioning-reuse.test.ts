import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Line = {
  id: bigint;
  userId: string;
  agentId: string | null;
  phoneNumber: string;
  vapiNumberId: string;
};

const h = vi.hoisted(() => ({
  lines: [] as Line[],
  slots: 2,
  beforeMutation: undefined as undefined | (() => void | Promise<void>),
  mutationTail: Promise.resolve(),
  lockHeld: false,
  purchase: vi.fn(),
  find: vi.fn(),
  route: vi.fn(),
  remove: vi.fn(),
  releasePurchase: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => (row: Record<string, unknown>) => row[field] === value,
  isNull: (field: string) => (row: Record<string, unknown>) => row[field] === null,
  and:
    (...predicates: Array<(row: Record<string, unknown>) => boolean>) =>
    (row: Record<string, unknown>) =>
      predicates.every((predicate) => predicate(row)),
  sql: () => "count",
  desc: (field: string) => field,
}));
vi.mock("../src/db/schema", () => ({
  agents: { table: "agents", id: "id", userId: "userId" },
  settings: { table: "settings", userId: "userId", twilioSmsFromNumber: "twilioSmsFromNumber" },
  phoneNumbers: {
    table: "phones",
    id: "id",
    userId: "userId",
    agentId: "agentId",
    phoneNumber: "phoneNumber",
    vapiNumberId: "vapiNumberId",
  },
}));
vi.mock("../src/lib/server-context", () => {
  const project = (row: Record<string, unknown>, fields?: Record<string, string>) =>
    fields
      ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, row[value]]))
      : { ...row };
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    drizzle: {
      select: (fields?: Record<string, string>) => {
        let table = "";
        let predicate = (_row: Record<string, unknown>) => true;
        let limit = Infinity;
        const execute = () => {
          const rows =
            table === "agents"
              ? [{ id: "bot", userId: "tenant" }]
              : table === "settings"
                ? []
                : h.lines.filter(predicate);
          return fields?.held
            ? [{ held: rows.length }]
            : rows.slice(0, limit).map((row) => project(row, fields));
        };
        const query = {
          from(value: { table: string }) {
            table = value.table;
            return query;
          },
          where(value: typeof predicate) {
            predicate = value;
            return query;
          },
          limit(value: number) {
            limit = value;
            return query;
          },
          then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve(execute()).then(resolve, reject);
          },
        };
        return query;
      },
      delete: () => ({
        async where(predicate: (row: Line) => boolean) {
          expect(h.lockHeld).toBe(true);
          h.lines = h.lines.filter((row) => !predicate(row));
        },
      }),
      update: () => {
        let changes: Partial<Line> = {};
        let predicate = (_row: Record<string, unknown>) => true;
        const query = {
          set(value: Partial<Line>) {
            changes = value;
            return query;
          },
          where(value: typeof predicate) {
            predicate = value;
            return query;
          },
          async returning(fields?: Record<string, string>) {
            return h.lines.filter(predicate).map((row) => {
              Object.assign(row, changes);
              return project(row, fields);
            });
          },
        };
        return query;
      },
    },
  };
});
vi.mock("../src/lib/company-identity-mutation", async () => {
  const { drizzle } = await import("../src/lib/server-context");
  return {
    runCompanyIdentityMutation: async (
      _userId: string,
      _reason: string,
      mutate: (tx: typeof drizzle) => Promise<unknown>,
    ) => {
      const beforeMutation = h.beforeMutation;
      h.beforeMutation = undefined;
      await beforeMutation?.();
      const previous = h.mutationTail;
      let unlock!: () => void;
      h.mutationTail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      h.lockHeld = true;
      try {
        return await mutate(drizzle);
      } finally {
        h.lockHeld = false;
        unlock();
      }
    },
  };
});
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  requireTenantPhoneChannel: async () => ({ channels: ["voice"] }),
}));
vi.mock("../src/lib/agent-phone-lines", () => ({
  findAgentPhoneLine: h.find,
  ensureTenantTelecomDefaults: vi.fn(),
  isTwilioPhoneNumberSid: () => true,
}));
vi.mock("../src/lib/phone-line-entitlements", () => ({
  getIncludedPhoneLineSlots: async () => h.slots,
}));
vi.mock("../src/lib/orphan-carrier-ledger", () => ({
  clearNativeTwilioPurchaseClaim: vi.fn(),
  NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS: 1200000,
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => ({ performed: true, result: await perform() }),
}));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({ incomingPhoneNumbers: () => ({ remove: h.remove }) }),
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({ openAISipConfigured: () => true }));
vi.mock("../src/lib/voice/native-phone-carrier", () => ({
  NATIVE_PROVISIONING_UNAVAILABLE: "unavailable",
  configureNativeNumberRouting: h.route,
  purchaseNativeNumber: h.purchase,
  releasePurchasedNativeNumber: h.releasePurchase,
  resolveOwnedTwilioNumberSid: vi.fn(),
}));

import { provisionNativeTenantNumber } from "../src/lib/voice/native-phone-provisioning";
import { releaseNativeTenantNumber } from "../src/lib/voice/native-phone-release";

const detached = (id: bigint, userId = "tenant"): Line => ({
  id,
  userId,
  agentId: null,
  phoneNumber: `+1202555012${id}`,
  vapiNumberId: `PN${id}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WIRELINE_AUTO_PROVISION_NUMBERS", "true");
  h.slots = 2;
  h.lines = [detached(1n)];
  h.beforeMutation = undefined;
  h.mutationTail = Promise.resolve();
  h.lockHeld = false;
  h.remove.mockReset().mockImplementation(async () => {
    expect(h.lockHeld).toBe(true);
  });
  h.purchase.mockRejectedValue(new Error("Purchase deliberately stopped"));
  h.find.mockReset().mockResolvedValue(null);
  h.route.mockImplementation(
    async ({ carrierNumberId }: { carrierNumberId: string }) => carrierNumberId,
  );
});

describe("native number release and reuse share the identity lock", () => {
  it("preserves a line assigned while release was waiting for the lock", async () => {
    h.beforeMutation = async () => {
      await provisionNativeTenantNumber({ userId: "tenant", agentId: "bot" });
    };
    const result = await releaseNativeTenantNumber("tenant", h.lines[0].phoneNumber);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("changed while release was pending");
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.lines[0].agentId).toBe("bot");
  });

  it("does not claim a line while carrier release is in progress", async () => {
    let finishRelease!: () => void;
    let carrierStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      carrierStarted = resolve;
    });
    const finish = new Promise<void>((resolve) => {
      finishRelease = resolve;
    });
    h.remove.mockImplementation(async () => {
      expect(h.lockHeld).toBe(true);
      carrierStarted();
      await finish;
    });
    const release = releaseNativeTenantNumber("tenant", h.lines[0].phoneNumber);
    await started;
    const provision = provisionNativeTenantNumber({ userId: "tenant", agentId: "bot" });
    try {
      // Let the competing request reach the held mutation lock.
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.lines[0].agentId).toBeNull();
      expect(h.route).not.toHaveBeenCalled();
    } finally {
      finishRelease();
    }
    expect(await release).toMatchObject({ ok: true });
    await provision;
    expect(h.lines).toEqual([]);
    expect(h.route).not.toHaveBeenCalled();
    expect(h.purchase).toHaveBeenCalledOnce();
  });

  it.each(["removed", "carrier_changed"])(
    "does not release a stale %s snapshot",
    async (change) => {
      const number = h.lines[0].phoneNumber;
      h.beforeMutation = () => {
        if (change === "removed") h.lines = [];
        else h.lines[0].vapiNumberId = "PN-replacement";
      };
      expect(await releaseNativeTenantNumber("tenant", number)).toMatchObject({ ok: false });
      expect(h.remove).not.toHaveBeenCalled();
    },
  );

  it("keeps the local line when the carrier cannot confirm release", async () => {
    h.remove.mockRejectedValue(new Error("Carrier unavailable"));
    expect(await releaseNativeTenantNumber("tenant", h.lines[0].phoneNumber)).toMatchObject({
      ok: false,
    });
    expect(h.lines).toHaveLength(1);
  });

  it("retires a line already absent from the carrier for safe cleanup retries", async () => {
    h.remove.mockRejectedValue({ status: 404 });
    expect(await releaseNativeTenantNumber("tenant", h.lines[0].phoneNumber)).toEqual({ ok: true });
    expect(h.lines).toEqual([]);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("native phone assignment reuses owned capacity", () => {
  it("background identity repair waits for a customer choice without claiming or buying a line", async () => {
    const result = await provisionNativeTenantNumber({
      userId: "tenant",
      agentId: "bot",
      requireExistingLine: true,
    });
    expect(result).toMatchObject({ ok: false, code: "NUMBER_SELECTION_REQUIRED" });
    expect(h.lines[0].agentId).toBeNull();
    expect(h.purchase).not.toHaveBeenCalled();
    expect(h.route).not.toHaveBeenCalled();
  });

  it("releases the extra purchase and reports a competing assignment without substituting it", async () => {
    h.lines = [];
    const selected = "+15615550102";
    const purchase = { phoneNumber: selected, sid: "PN_selected" };
    h.purchase.mockResolvedValue(purchase);
    h.beforeMutation = () => {
      h.lines = [{ ...detached(1n), agentId: "bot" }];
    };
    const result = await provisionNativeTenantNumber({
      userId: "tenant",
      agentId: "bot",
      preferredPhoneNumber: selected,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(h.releasePurchase).toHaveBeenCalledWith(
      expect.objectContaining({ purchase, cause: "AGENT_ALREADY_PROVISIONED" }),
    );
    expect(h.route).not.toHaveBeenCalled();
    expect(h.lines[0].phoneNumber).not.toBe(selected);
  });

  it("does not substitute a different assigned number for an explicit choice", async () => {
    h.find.mockResolvedValue({
      id: 1n,
      phoneNumber: "+12025550121",
      carrierNumberId: "PN1",
    });
    await expect(
      provisionNativeTenantNumber({
        userId: "tenant",
        agentId: "bot",
        preferredPhoneNumber: "+14155550123",
      }),
    ).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
    expect(h.route).not.toHaveBeenCalled();
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it("keeps retrying the same selected assigned number idempotent", async () => {
    h.find.mockResolvedValue({
      id: 1n,
      phoneNumber: "+12025550121",
      carrierNumberId: "PN1",
    });
    await expect(
      provisionNativeTenantNumber({
        userId: "tenant",
        agentId: "bot",
        preferredPhoneNumber: "+12025550121",
      }),
    ).resolves.toMatchObject({ ok: true, reused: true, phoneNumber: "+12025550121" });
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it("does not replace an explicit choice with a detached number at capacity", async () => {
    h.slots = 1;
    await expect(
      provisionNativeTenantNumber({
        userId: "tenant",
        agentId: "bot",
        preferredPhoneNumber: "+14155550123",
      }),
    ).resolves.toMatchObject({ ok: false, code: "PHONE_CAPACITY_REACHED" });
    expect(h.lines[0].agentId).toBeNull();
    expect(h.route).not.toHaveBeenCalled();
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it("reuses a detached owned line before buying while paid capacity remains", async () => {
    await expect(
      provisionNativeTenantNumber({ userId: "tenant", agentId: "bot" }),
    ).resolves.toMatchObject({
      ok: true,
      phoneNumber: "+12025550121",
      reused: true,
    });
    expect(h.purchase).not.toHaveBeenCalled();
    expect(h.lines[0].agentId).toBe("bot");
  });

  it("rechecks the Bot assignment inside the mutation lock before claiming another line", async () => {
    h.lines.push(detached(2n));
    h.beforeMutation = () => {
      // Another reconciliation already committed this Bot's line after the initial read.
      h.lines[1].agentId = "bot";
    };

    await expect(
      provisionNativeTenantNumber({ userId: "tenant", agentId: "bot" }),
    ).resolves.toMatchObject({
      ok: true,
      phoneNumber: "+12025550122",
      reused: true,
    });
    expect(h.lines.filter((line) => line.agentId === "bot")).toHaveLength(1);
    expect(h.lines[0].agentId).toBeNull();
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it.each([{ areaCode: "415" }, { preferredPhoneNumber: "+14155550123" }])(
    "honors an explicit selection when capacity remains: %j",
    async (selection) => {
      await provisionNativeTenantNumber({ userId: "tenant", agentId: "bot", ...selection });
      expect(h.purchase).toHaveBeenCalledWith({ userId: "tenant", agentId: "bot", ...selection });
      expect(h.lines[0].agentId).toBeNull();
    },
  );

  it("never claims another tenant's detached number", async () => {
    h.lines = [detached(1n, "other-tenant")];
    await provisionNativeTenantNumber({ userId: "tenant", agentId: "bot" });
    expect(h.lines[0].agentId).toBeNull();
    expect(h.route).not.toHaveBeenCalled();
    expect(h.purchase).toHaveBeenCalledOnce();
  });
});
