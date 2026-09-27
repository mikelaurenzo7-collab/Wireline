import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
}));
vi.mock("../src/lib/platform-owner-emails", () => ({
  isOwnerEmail: (email: string) => email === "owner@example.test",
}));
import {
  reserveVoiceCallFunding,
  releaseVoiceCallFunding,
  releaseVoiceCallFundingInTransaction,
  settleVoiceCallFunding,
} from "../src/lib/voice-call-funding";
import { chargeCompletedVoiceUsage } from "../src/lib/voice-completion-grace";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const call = (providerCallId = "openai:first", maxSeconds = 3600) => ({
  userId,
  providerCallId,
  maxSeconds,
});

/** Real source locks, not a test-wide mutex, serialize independent transactions. */
function database(
  options: { balance?: number; used?: number; plan?: string; status?: string; email?: string } = {},
) {
  const rows: any[] = options.balance
    ? [
        {
          id: "topup",
          userId,
          deltaUsd: String(options.balance),
          refType: "top_up",
          refId: "topup",
          idempotencyKey: "topup",
          metadata: {},
        },
      ]
    : [];
  const locks = new Map<string, Promise<void>>();
  const lockKeys: string[] = [];
  const state = {
    used: options.used ?? 50,
    plan: options.plan ?? "voice",
    status: options.status ?? "active",
    email: options.email ?? "pilot@example.test",
    failInsert: false,
    usageClaimed: false,
    paidStart: Math.floor(Date.now() / 1000) - 86400,
    paidEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
    hasPaidReceipt: true,
  };
  const dialect = new PgDialect();
  const balance = () => rows.reduce((sum, row) => sum + Number(row.deltaUsd), 0);
  const db = {
    transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const staged: any[] = [];
      const releases: Array<() => void> = [];
      const owned = new Set<string>();
      const visible = () => [...rows, ...staged];
      const query = (
        operation: "select" | "insert",
        selection?: Record<string, unknown>,
        initialTable?: string,
      ) => {
        let table = initialTable;
        let filter: { sql: string; params: unknown[] } | undefined;
        let values: any;
        const q: any = {
          from: (source: any) => {
            table = getTableName(source);
            return q;
          },
          leftJoin: () => q,
          where: (predicate: any) => {
            filter = dialect.sqlToQuery(predicate);
            return q;
          },
          limit: () => q,
          values: (value: any) => {
            values = value;
            return q;
          },
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve()
              .then(() => {
                if (operation === "insert") {
                  if (state.failInsert) throw new Error("insert failed");
                  if (
                    visible().some(
                      (row) =>
                        row.userId === values.userId &&
                        row.idempotencyKey === values.idempotencyKey,
                    )
                  )
                    throw new Error("duplicate ledger key");
                  const row = { ...values, id: `entry-${visible().length}`, createdAt: new Date() };
                  staged.push(row);
                  return [row];
                }
                if (table === "wireline_users") return [{ ...state }];
                if (table === "wireline_subscriptions")
                  return [{ ...state, subscriptionId: "sub_paid", customerId: "cus_paid" }];
                if (table === "wireline_quota_usage") return [{ used: BigInt(state.used) }];
                if (table === "wireline_voice_usage_events")
                  return state.usageClaimed ? [{ providerCallId: "openai:first" }] : [];
                if (table !== "wireline_credit_ledger")
                  throw new Error(`Unexpected table ${table}`);
                const scoped = visible().filter((row) => row.userId === filter?.params[0]);
                if (filter?.params[1] === "paid_plan_allowance")
                  return state.hasPaidReceipt
                    ? [
                        {
                          metadata: {
                            version: 1,
                            subscription_id: "sub_paid",
                            customer_id: "cus_paid",
                            invoice_id: "in_paid",
                            price_id: "price_paid",
                            plan_id: state.plan,
                            interval: "month",
                            period_start: state.paidStart,
                            period_end: state.paidEnd,
                          },
                        },
                      ]
                    : [];
                if (selection && "balance" in selection)
                  return [
                    { balance: String(scoped.reduce((sum, row) => sum + Number(row.deltaUsd), 0)) },
                  ];
                if (filter?.sql.includes("NOT EXISTS"))
                  return scoped.filter(
                    (row) =>
                      row.refType === "voice_admission" &&
                      !scoped.some(
                        (other) =>
                          other.refId === row.refId &&
                          ["voice_completion", "voice_admission_release"].includes(other.refType),
                      ),
                  );
                return scoped.filter((row) => row.idempotencyKey === filter?.params[1]);
              })
              .then(resolve, reject),
        };
        return q;
      };
      const tx = {
        execute: async (statement: any) => {
          const key = String(dialect.sqlToQuery(statement).params[0]);
          lockKeys.push(key);
          if (owned.has(key)) return [];
          const prior = locks.get(key) ?? Promise.resolve();
          let unlock!: () => void;
          const held = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          locks.set(
            key,
            prior.then(() => held),
          );
          await prior;
          owned.add(key);
          releases.push(unlock);
          return [];
        },
        select: (selection?: Record<string, unknown>) => query("select", selection),
        insert: (table: any) => query("insert", undefined, getTableName(table)),
      };
      try {
        const result = await fn(tx);
        rows.push(...staged);
        return result;
      } finally {
        releases.reverse().forEach((unlock) => unlock());
      }
    },
  };
  h.db = db;
  const reserve = (input = call()) => db.transaction((tx) => reserveVoiceCallFunding(tx, input));
  return { rows, state, lockKeys, db, reserve, balance };
}

afterEach(() => vi.useRealTimers());

describe("paid channel call periods", () => {
  it("does not refill a 500-minute plan on Oct 1 after one Sep 30 payment", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const data = database({ plan: "voice-high", used: 0 });
    data.state.paidStart = Date.parse("2026-09-30T12:00:00Z") / 1000;
    data.state.paidEnd = Date.parse("2026-10-30T12:00:00Z") / 1000;
    const funding = await data.reserve();
    expect(funding?.periodKey).toBe(`paid:sub_paid:${data.state.paidStart}`);
    await releaseVoiceCallFunding(userId, "openai:first");
    data.state.used = 500;
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    await expect(data.reserve(call("openai:next"))).rejects.toMatchObject({
      code: "VOICE_FUNDING_REQUIRED",
    });
  });

  it("requires a paid period receipt before granting call capacity", async () => {
    const data = database({ used: 0 });
    data.state.hasPaidReceipt = false;
    await expect(data.reserve()).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    expect(data.rows).toHaveLength(0);
  });
});

beforeEach(() => vi.restoreAllMocks());

describe("durable call funding admission", () => {
  it.each([
    ["voice-regular", 250],
    ["voice-high", 500],
  ] as const)(
    "keeps %s calls on one remaining minute and one unresolved call hold",
    async (plan, included) => {
      const data = database({ plan, used: included - 1 });
      expect(await data.reserve(call("openai:role-one"))).toMatchObject({
        includedMinutes: 1,
        maxSeconds: 660,
        prepaidHoldUsd: 0,
        graceMinutes: 10,
      });
      await expect(data.reserve(call("openai:role-two"))).rejects.toMatchObject({
        code: "VOICE_FUNDING_IN_USE",
      });
      expect(data.rows).toHaveLength(1);
      expect(data.lockKeys.every((key) => key === userId)).toBe(true);
    },
  );
  it("reserves only funded minutes and persists a bounded deadline across retry", async () => {
    const data = database({ balance: 1.1 });
    const initial = (await data.reserve()) as any;
    expect(initial).toMatchObject({ maxSeconds: 900, prepaidHoldUsd: 1.1, graceMinutes: 10 });
    expect(initial.deadlineAtMs - initial.startedAtMs).toBe(900000);
    expect(data.balance()).toBeCloseTo(0, 8);
    data.state.status = "canceled";
    vi.spyOn(Date, "now").mockReturnValue(initial.startedAtMs + 60000);
    expect(await data.reserve(call("openai:first", 7200))).toEqual(initial);
    expect(data.rows.filter((row) => row.refType === "voice_admission")).toHaveLength(1);
  });

  it("persists a zero-dollar hold for included-only calls and shares one pool", async () => {
    const data = database({ used: 0 });
    expect(await data.reserve()).toMatchObject({
      maxSeconds: 3600,
      prepaidHoldUsd: 0,
      graceMinutes: 10,
    });
    await expect(data.reserve(call("twilio-fallback:second"))).rejects.toMatchObject({
      code: "VOICE_FUNDING_IN_USE",
    });
    expect(data.rows).toHaveLength(1);
  });

  it("does not append grace beyond a shorter existing session cap", async () => {
    const data = database({ used: 0, balance: 5 });
    expect(await data.reserve(call("message", 300))).toMatchObject({
      maxSeconds: 300,
      prepaidHoldUsd: 0,
      graceMinutes: 0,
    });
    expect(data.balance()).toBe(5);
  });

  it("rejects unpaid or insolvent accounts even if grace or included minutes exist", async () => {
    for (const options of [
      { used: 50, balance: 0 },
      { used: 50, balance: 0.21 },
      { used: 0, balance: -0.01 },
    ]) {
      const data = database(options);
      await expect(data.reserve()).rejects.toMatchObject({ code: "VOICE_FUNDING_REQUIRED" });
      expect(data.rows.filter((row) => row.refType === "voice_admission")).toHaveLength(0);
    }
  });

  it.each([{ plan: "email" }, { status: "past_due" }, { plan: "missing" }])(
    "fails closed for unsupported entitlement %j",
    async (options) => {
      const data = database({ ...options, balance: 20 });
      await expect(data.reserve()).rejects.toMatchObject({ code: "VOICE_PLAN_REQUIRED" });
    },
  );

  it("leaves resolved legacy and server-known owner funding unchanged", async () => {
    expect(await database({ plan: "starter" }).reserve()).toBeNull();
    expect(
      await database({
        email: "owner@example.test",
        status: "pending_activation",
        plan: "personal",
      }).reserve(),
    ).toBeNull();
  });

  it("serializes competing calls by the actual wallet lock", async () => {
    const data = database({ balance: 10, used: 0 });
    const results = await Promise.allSettled([
      data.reserve(call("sip")),
      data.reserve(call("fallback")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "VOICE_FUNDING_IN_USE" },
    });
    expect(data.lockKeys).toEqual([userId, userId]);
    expect(data.rows.filter((row) => row.refType === "voice_admission")).toHaveLength(1);
  });

  it("rolls back the financial hold together with a failed provider claim transaction", async () => {
    const data = database({ balance: 1.1 });
    await expect(
      data.db.transaction(async (tx) => {
        await reserveVoiceCallFunding(tx, call());
        throw new Error("claim insert failed");
      }),
    ).rejects.toThrow("claim insert failed");
    expect(data.balance()).toBe(1.1);
    expect(data.rows).toHaveLength(1);
  });
});

describe("call funding settlement and release", () => {
  const settle = (costUsd: number, providerCallId = "openai:first") =>
    settleVoiceCallFunding({
      userId,
      providerCallId,
      costUsd,
      billableMinutes: Math.round(costUsd / 0.22),
      rateUsd: 0.22,
    });

  it("returns unused hold even when included usage makes the final charge zero", async () => {
    const data = database({ balance: 2.2, used: 25 });
    await data.reserve();
    expect(data.balance()).toBeCloseTo(0, 8);
    expect(
      await chargeCompletedVoiceUsage({
        userId,
        providerCallId: "openai:first",
        costUsd: 0,
        billableMinutes: 0,
        rateUsd: 0.22,
      }),
    ).toMatchObject({ balance_usd: 2.2, used_completion_grace: false });
    expect(data.balance()).toBeCloseTo(2.2, 8);
    await expect(data.reserve()).rejects.toMatchObject({ code: "VOICE_FUNDING_SETTLED" });
    await expect(data.reserve(call("next"))).resolves.toBeTruthy();
  });

  it("applies only the net adjustment once and records completion debt", async () => {
    const data = database({ balance: 1.1 });
    await data.reserve();
    const results = await Promise.all([settle(3.3), settle(3.3)]);
    expect(results).toEqual(
      expect.arrayContaining([
        { applied: 2.2, balance: -2.2 },
        { applied: 0, balance: -2.2 },
      ]),
    );
    expect(data.balance()).toBeCloseTo(-2.2, 8);
    expect(data.rows.filter((row) => row.refType === "voice_completion")).toHaveLength(1);
    await expect(data.reserve(call("next"))).rejects.toMatchObject({
      code: "VOICE_FUNDING_REQUIRED",
    });
  });

  it("does not partially refund when settlement persistence fails", async () => {
    const data = database({ balance: 2.2 });
    await data.reserve();
    data.state.failInsert = true;
    await expect(settle(0.22)).rejects.toThrow("insert failed");
    expect(data.balance()).toBeCloseTo(0, 8);
    await expect(data.reserve(call("next"))).rejects.toMatchObject({
      code: "VOICE_FUNDING_IN_USE",
    });
    data.state.failInsert = false;
    await settle(0.22);
    expect(data.balance()).toBeCloseTo(1.98, 8);
  });

  it("releases definitively unused funding once and never resurrects it", async () => {
    const data = database({ balance: 1.1 });
    await data.reserve();
    await Promise.all([
      releaseVoiceCallFunding(userId, "openai:first"),
      releaseVoiceCallFunding(userId, "openai:first"),
    ]);
    expect(data.balance()).toBeCloseTo(1.1, 8);
    expect(data.rows.filter((row) => row.refType === "voice_admission_release")).toHaveLength(1);
    await expect(data.reserve()).rejects.toMatchObject({ code: "VOICE_FUNDING_SETTLED" });
    // Returned funds can already be spent. A contradictory callback cannot
    // reopen the customer liability or refund the old hold a second time.
    data.rows.push({ userId, deltaUsd: "-1.1", idempotencyKey: "other_spend" });
    await settle(0.22);
    expect(data.balance()).toBeCloseTo(0, 8);
    expect(data.rows.find((row) => row.refType === "voice_completion").metadata).toMatchObject({
      charged_usd: 0,
      excluded_after_confirmed_release: true,
      reconciliation_required: true,
    });
  });

  it("records proven unanswered disposition without a nested transaction", async () => {
    const data = database({ used: 0 });
    await data.db.transaction(async (tx) => {
      await reserveVoiceCallFunding(tx, call());
      await releaseVoiceCallFundingInTransaction(tx, {
        userId,
        providerCallId: "openai:first",
        disposition: "confirmed_unanswered",
      });
    });
    expect(data.rows[1].metadata.disposition).toBe("confirmed_unanswered");
    await expect(data.reserve(call("next"))).resolves.toBeTruthy();
  });

  it("cannot refund a completed call through later failure cleanup", async () => {
    const data = database({ balance: 1.1 });
    await data.reserve();
    await settle(0.44);
    await releaseVoiceCallFunding(userId, "openai:first");
    expect(data.balance()).toBeCloseTo(0.66, 8);
    expect(data.rows.some((row) => row.refType === "voice_admission_release")).toBe(false);
  });

  it("keeps a hold with the durable usage finalizer after completion has claimed it", async () => {
    const data = database({ balance: 1.1 });
    await data.reserve();
    data.state.usageClaimed = true;
    await releaseVoiceCallFunding(userId, "openai:first", "confirmed_startup_failure");
    expect(data.balance()).toBeCloseTo(0, 8);
    expect(data.rows.some((row) => row.refType === "voice_admission_release")).toBe(false);
    await settle(0.22);
    expect(data.balance()).toBeCloseTo(0.88, 8);
  });

  it("never expands the agreed charge beyond prepaid coverage plus stored completion grace", async () => {
    const data = database({ used: 0 });
    await data.reserve();
    expect(await settle(99)).toEqual({ applied: 2.2, balance: -2.2 });
    expect(data.rows.find((row) => row.refType === "voice_completion").metadata.charged_usd).toBe(
      2.2,
    );
  });
});
