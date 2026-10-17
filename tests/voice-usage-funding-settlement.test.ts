import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  db: null as any,
  settle: vi.fn(),
  funding: vi.fn(),
  log: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  log: h.log,
}));
vi.mock("../src/lib/voice-completion-grace", () => ({ chargeCompletedVoiceUsage: h.settle }));
vi.mock("../src/lib/voice-call-funding", () => ({ getVoiceCallFundingInTransaction: h.funding }));
vi.mock("../src/lib/tenant-quotas", () => ({ dailyPeriodKey: () => "2026-09-27" }));
import { trackVoiceMinutes } from "../src/lib/voice-usage";

function database(ledger: any[] = []) {
  let event: any = null;
  let monthlyUsed = 0;
  let billingReads = 0;
  const dialect = new PgDialect();
  const query = (operation: string, table?: string) => {
    let value: any;
    let predicate: any;
    const q: any = {
      from: (source: any) => {
        table = getTableName(source);
        return q;
      },
      leftJoin: () => q,
      where: (input: any) => {
        predicate = dialect.sqlToQuery(input);
        return q;
      },
      limit: () => q,
      onConflictDoNothing: () => q,
      onConflictDoUpdate: () => q,
      returning: () => q,
      values: (input: any) => {
        value = input;
        return q;
      },
      set: (input: any) => {
        value = input;
        return q;
      },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            if (operation === "insert" && table === "wireline_voice_usage_events") {
              if (event) return [];
              event = { ...value, chargedAt: null };
              return [event];
            }
            if (operation === "insert" && table === "wireline_quota_usage") {
              if (value.dimension === "voice_minutes_monthly") monthlyUsed += Number(value.used);
              return [{ used: monthlyUsed }];
            }
            if (operation === "update") {
              Object.assign(event, value);
              return [event];
            }
            if (table === "wireline_settings") {
              billingReads++;
              return [{ plan: "voice", extraAgents: 0 }];
            }
            if (table === "wireline_voice_usage_events") return [event];
            if (table === "wireline_credit_ledger")
              return ledger.filter(
                (row) =>
                  row.userId === predicate.params[0] && row.idempotencyKey === predicate.params[1],
              );
            throw new Error(`Unexpected ${operation} ${table}`);
          })
          .then(resolve, reject),
    };
    return q;
  };
  const db: any = {
    execute: vi.fn(async () => []),
    select: () => query("select"),
    insert: (table: any) => query("insert", getTableName(table)),
    update: (table: any) => query("update", getTableName(table)),
    transaction: (fn: (tx: any) => unknown) => fn(db),
  };
  h.db = db;
  return {
    get event() {
      return event;
    },
    get monthlyUsed() {
      return monthlyUsed;
    },
    get billingReads() {
      return billingReads;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.settle.mockResolvedValue({ used_completion_grace: false, balance_usd: 2.2 });
  h.funding.mockResolvedValue(null);
});

describe("self-phone-test parent duration accounting", () => {
  const canonical = "outbound:12345678-1234-4234-8234-123456789012";
  const sid = `twilio:CA${"1".repeat(32)}`;
  const alias = (id: string) => ({
    userId: "user",
    deltaUsd: "0",
    refType: "voice_funding_alias",
    idempotencyKey: `voice_funding_alias:${id}`,
    metadata: { canonical_call_id: canonical, provider_call_id: id },
  });
  it("counts carrier verification and SIP as one call using terminal parent duration", async () => {
    const db = database([
      alias("openai:self-test"),
      alias(sid),
      {
        userId: "user",
        idempotencyKey: `voice_phone_test_terminal:${canonical}`,
        metadata: { duration_seconds: 70 },
      },
    ]);
    h.funding.mockResolvedValue({
      maxSeconds: 120,
      periodKey: "2026-09",
      planId: "voice",
      includedMinutes: 2,
      rateUsd: 0.22,
    });
    await trackVoiceMinutes({
      userId: "user",
      vapiCallId: "openai:self-test",
      durationSeconds: 10,
    });
    await trackVoiceMinutes({ userId: "user", vapiCallId: sid, durationSeconds: 70 });
    expect(db.event).toMatchObject({ providerCallId: canonical, billableMinutes: 2 });
    expect(db.monthlyUsed).toBe(2);
    expect(h.settle).toHaveBeenCalledOnce();
    expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({ providerCallId: canonical }));
  });
  it("waits for parent termination instead of prematurely settling the shorter SIP phase", async () => {
    const db = database([alias("openai:self-test")]);
    await expect(
      trackVoiceMinutes({ userId: "user", vapiCallId: "openai:self-test", durationSeconds: 10 }),
    ).rejects.toThrow("awaiting terminal confirmation");
    expect(db.event).toBeNull();
    expect(db.monthlyUsed).toBe(0);
    expect(h.settle).not.toHaveBeenCalled();
  });
});

describe("included-only voice completion", () => {
  it("does not resurrect usage or debt after a definitive funding release", async () => {
    const db = database();
    h.funding.mockResolvedValue({ released: true, rateUsd: 0.22, planId: "voice" });
    await trackVoiceMinutes({ userId: "user", vapiCallId: "openai:released", durationSeconds: 60 });
    expect(db.event).toBeNull();
    expect(db.monthlyUsed).toBe(0);
    expect(h.settle).not.toHaveBeenCalled();
  });
  it("settles the funding hold even when the completed call has no overage", async () => {
    const db = database();
    await trackVoiceMinutes({ userId: "user", vapiCallId: "openai:call", durationSeconds: 120 });
    expect(h.settle).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0, billableMinutes: 0, providerCallId: "openai:call" }),
    );
    expect(db.event.chargedAt).toBeInstanceOf(Date);
    expect(db.monthlyUsed).toBe(2);
    await trackVoiceMinutes({ userId: "user", vapiCallId: "openai:call", durationSeconds: 120 });
    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(db.monthlyUsed).toBe(2);
  });

  it("retains retry after a failed hold settlement without recounting minutes", async () => {
    const db = database();
    h.settle.mockRejectedValueOnce(new Error("ledger unavailable"));
    const call = { userId: "user", vapiCallId: "openai:call", durationSeconds: 30 };
    await expect(trackVoiceMinutes(call)).rejects.toThrow("ledger unavailable");
    expect(db.event.chargedAt).toBeNull();
    expect(db.monthlyUsed).toBe(1);
    await trackVoiceMinutes(call);
    expect(h.settle).toHaveBeenCalledTimes(2);
    expect(db.event.chargedAt).toBeInstanceOf(Date);
    expect(db.monthlyUsed).toBe(1);
  });

  it("preserves admission coverage after cancellation and month rollover, even on provider overrun", async () => {
    const db = database();
    h.funding.mockResolvedValue({
      maxSeconds: 2400,
      includedMinutes: 30,
      rateUsd: 0.22,
      planId: "voice",
      periodKey: "2026-08",
    });
    h.settle.mockRejectedValueOnce(new Error("retry settlement"));
    const call = { userId: "user", vapiCallId: "openai:funded", durationSeconds: 7200 };
    await expect(trackVoiceMinutes(call)).rejects.toThrow("retry settlement");
    expect(db.event).toMatchObject({
      periodKey: "2026-08",
      billableMinutes: 40,
      incrementalOverageMinutes: 10,
      overageCostUsd: "2.2",
    });
    expect(db.monthlyUsed).toBe(40);
    expect(db.billingReads).toBe(0);
    await trackVoiceMinutes(call);
    expect(h.settle).toHaveBeenLastCalledWith(
      expect.objectContaining({ costUsd: 2.2, billableMinutes: 10, rateUsd: 0.22 }),
    );
    expect(db.billingReads).toBe(0);
    expect(db.monthlyUsed).toBe(40);
  });
});
