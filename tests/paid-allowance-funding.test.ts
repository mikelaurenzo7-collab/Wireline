import type Stripe from "stripe";
import { getTableName, sql, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema";
import type { Request, Response } from "express";
const h = vi.hoisted(() => ({ db: null as any }));
const claims = vi.hoisted(() => ({ complete: vi.fn(), release: vi.fn() }));
vi.mock("../src/lib/stripe-event-claim", () => ({
  claimStripeEvent: vi.fn(async () => ({ kind: "claimed", claim: { eventId: "evt_paid" } })),
  completeStripeEventClaim: claims.complete,
  releaseStripeEventClaim: claims.release,
}));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  tenantStore: { run: (_user: string, work: () => unknown) => work() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLogger: {},
}));
import {
  recordPaidAllowanceReceipt,
  resolveAllowanceWindow,
  type PaidAllowanceReceipt,
} from "../src/lib/paid-allowance-period";
import {
  recordPaidAllowanceFundingMovements,
  type PaidFundingMovement,
} from "../src/lib/paid-allowance-funding-ledger";
import { reconcilePaidAllowanceFundingForCharge } from "../src/lib/stripe-paid-allowance-funding";
import { stripeRuntimeAllowanceRetryPreflight } from "../src/middleware/stripe-runtime-allowance-retry";
import * as stripeHelpers from "../src/lib/stripe-helpers";
import * as wallet from "../src/lib/credit-wallet";

const start = Date.parse("2026-09-30T12:00:00Z") / 1000;
const end = Date.parse("2026-10-30T12:00:00Z") / 1000;
const receipt = (extra: Partial<PaidAllowanceReceipt> = {}): PaidAllowanceReceipt => ({
  version: 1,
  subscription_id: "sub_paid",
  customer_id: "cus_paid",
  price_id: "price_paid",
  invoice_id: "in_paid",
  plan_id: "voice-high",
  interval: "month",
  period_start: start,
  period_end: end,
  ...extra,
});
const movement = (extra: Partial<PaidFundingMovement> = {}): PaidFundingMovement => ({
  kind: "refund",
  reference: "re_paid",
  amount_cents: 1900,
  charge_id: "ch_paid",
  charge_cents: 1900,
  payment_intent_id: "pi_paid",
  ...extra,
});
const now = new Date("2026-10-01T00:00:00Z");
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function database() {
  const rows: any[] = [];
  const billing: Record<string, any> = {
    tenant: {
      plan: "voice-high",
      status: "active",
      subscriptionId: "sub_paid",
      customerId: "cus_paid",
    },
  };
  const budgets = new Set(["tenant"]);
  const events: string[] = [];
  const queues = new Map<string, Promise<void>>();
  const dialect = new PgDialect();
  let serial = 0;
  const client = (held?: Map<string, () => void>, inserted: any[] = []) => {
    async function lock(key: string) {
      events.push(`attempt:${key}`);
      if (!held || held.has(key)) return;
      const previous = queues.get(key) ?? Promise.resolve();
      const next = deferred();
      queues.set(key, next.promise);
      await previous;
      held.set(key, next.resolve);
      events.push(`locked:${key}`);
    }
    const db: any = {
      transaction: async (work: (tx: any) => Promise<unknown>) => {
        const locks = new Map<string, () => void>();
        const own: any[] = [];
        try {
          return await work(client(locks, own));
        } catch (error) {
          for (const row of own) rows.splice(rows.indexOf(row), 1);
          throw error;
        } finally {
          for (const release of [...locks.values()].reverse()) release();
        }
      },
      execute: async (value: any) => {
        const query = dialect.sqlToQuery(value);
        await lock(`wallet:${query.params[0]}`);
      },
      select: (selection: any) => {
        let table = "";
        let filter: { sql: string; params: unknown[] } = { sql: "", params: [] };
        let update = false;
        let limit = Infinity;
        const q: any = {
          from: (source: any) => {
            table = getTableName(source);
            return q;
          },
          where: (value: any) => {
            filter = dialect.sqlToQuery(value);
            return q;
          },
          limit: (value: number) => {
            limit = value;
            return q;
          },
          for: () => {
            update = true;
            return q;
          },
          then: (done: any, fail: any) =>
            (async () => {
              const user = String(filter.params[0]);
              if (table === "wireline_spend_budgets") {
                if (update) await lock(`budget:${user}`);
                return budgets.has(user) ? [{ userId: user }] : [];
              }
              if (table === "wireline_subscriptions") return billing[user] ? [billing[user]] : [];
              if (table !== "wireline_credit_ledger") throw new Error(`Unexpected table ${table}`);
              if (filter.sql.includes('"provider_object_id"'))
                return rows
                  .filter(
                    (row) =>
                      row.refType === filter.params[0] &&
                      row.provider === filter.params[1] &&
                      row.providerObjectId === filter.params[2],
                  )
                  .slice(0, limit);
              const own = rows.filter((row) => row.userId === user);
              if (selection.balance)
                return [
                  { balance: String(own.reduce((sum, row) => sum + Number(row.deltaUsd), 0)) },
                ];
              return own
                .filter(
                  (row) =>
                    row.refType === filter.params[1] &&
                    (filter.sql.includes('"ref_id"')
                      ? row.refId === filter.params[2]
                      : filter.sql.includes("invoice_id")
                        ? row.metadata.invoice_id === filter.params[2]
                        : row.metadata.subscription_id === filter.params[2]),
                )
                .slice(0, limit);
            })().then(done, fail),
        };
        return q;
      },
      insert: () => ({
        values: (value: any) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (
                rows.some(
                  (row) =>
                    row.userId === value.userId && row.idempotencyKey === value.idempotencyKey,
                )
              )
                return [];
              // PostgreSQL jsonb does not preserve insertion-key order.
              const row = {
                ...value,
                id: String(++serial),
                metadata: Object.fromEntries(Object.entries(value.metadata ?? {}).reverse()),
              };
              rows.push(row);
              inserted.push(row);
              return [{ id: row.id }];
            },
          }),
        }),
      }),
    };
    return db;
  };
  const db = client();
  h.db = db;
  return { db, rows, billing, budgets, events };
}

function write(r = receipt(), movements = [movement()], userId = "tenant") {
  return recordPaidAllowanceFundingMovements({
    userId,
    receipt: r,
    invoicePaidCents: 1900,
    currency: "usd",
    providerEventId: "evt_paid",
    movements,
  });
}
async function setup(r = receipt()) {
  const data = database();
  data.rows.push({ userId: "tenant", deltaUsd: "12.34", refType: "topup", metadata: {} });
  await recordPaidAllowanceReceipt("tenant", r);
  data.events.length = 0;
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_VOICE_HIGH_PRICE_ID", "price_paid");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("durable paid invoice funding", () => {
  it("blocks a fully refunded period without a wallet debit, cancellation or usage reset", async () => {
    const data = await setup();
    await write();
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
      statusCode: 402,
    });
    expect(data.rows.reduce((sum, row) => sum + Number(row.deltaUsd), 0)).toBe(12.34);
    expect(data.billing.tenant.status).toBe("active");
    expect(data.rows.filter((row) => row.refType === "paid_plan_allowance")).toHaveLength(1);
    expect(data.events.slice(0, 4)).toEqual([
      "attempt:budget:tenant",
      "locked:budget:tenant",
      "attempt:wallet:tenant",
      "locked:wallet:tenant",
    ]);
  });
  it("does not revoke a partial courtesy refund; cumulative succeeded full returns do revoke", async () => {
    const data = await setup();
    await write(receipt(), [movement({ amount_cents: 950 })]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toMatchObject({
      key: `paid:sub_paid:${start}`,
    });
    await write(receipt(), [movement({ reference: "re_second", amount_cents: 950 })]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
    });
  });
  it("retains the hold across annual slices and original paid-receipt refresh/replay", async () => {
    const annual = receipt({
      interval: "year",
      period_end: Date.parse("2027-09-30T12:00:00Z") / 1000,
    });
    const data = await setup(annual);
    await write(annual);
    await recordPaidAllowanceReceipt("tenant", annual);
    for (const date of [now, new Date("2027-05-01T00:00:00Z")])
      await expect(resolveAllowanceWindow(data.db, "tenant", date)).rejects.toMatchObject({
        code: "PAID_ALLOWANCE_FUNDING_REVERSED",
      });
  });
  it("keeps reporting available with a funding flag, while admission stays blocked", async () => {
    const data = await setup();
    await write();
    await expect(
      resolveAllowanceWindow(data.db, "tenant", now, { reportingOnly: true }),
    ).resolves.toMatchObject({ key: `paid:sub_paid:${start}`, fundingReversed: true });
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
    });
  });
  it("replays jsonb movement receipts once and refuses a changed principal", async () => {
    const data = await setup();
    await write();
    await write();
    expect(data.rows.filter((row) => row.refType === "paid_plan_funding_movement")).toHaveLength(1);
    await expect(write(receipt(), [movement({ amount_cents: 1000 })])).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_SYNC_REQUIRED",
    });
  });
  it.each([
    { customer_id: "cus_other" },
    { subscription_id: "sub_other" },
    { invoice_id: "in_other" },
    { price_id: "price_other" },
    { period_end: end - 1 },
  ])("refuses incompatible canonical identity %j", async (extra) => {
    const data = await setup();
    await expect(write(receipt(extra))).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_SYNC_REQUIRED",
    });
    expect(data.rows).toHaveLength(2);
  });
  it("does not apply another tenant's receipt or an absent budget", async () => {
    const data = await setup();
    data.budgets.add("other");
    await expect(write(receipt(), [movement()], "other")).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_SYNC_REQUIRED",
    });
    data.budgets.delete("tenant");
    await expect(write()).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    expect(data.rows).toHaveLength(2);
  });
  it("restores only exact prior dispute funding, once, without replenishing usage", async () => {
    const data = await setup();
    const original = movement({ kind: "dispute_withdrawal", reference: "dp_paid" });
    await write(receipt(), [original]);
    await write(receipt(), [{ ...original, kind: "dispute_reinstatement" }]);
    await write(receipt(), [{ ...original, kind: "dispute_reinstatement" }]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toMatchObject({
      key: `paid:sub_paid:${start}`,
    });
    expect(data.rows).toHaveLength(4);
    expect(data.rows.reduce((sum, row) => sum + Number(row.deltaUsd), 0)).toBe(12.34);
    await expect(
      write(receipt(), [movement({ kind: "dispute_reinstatement", reference: "dp_unknown" })]),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
  });
  it("persists returned-refund proof before success without a hold or a later stale revival", async () => {
    const data = await setup();
    await write(receipt(), [movement({ kind: "refund_return" })]);
    expect(data.rows).toHaveLength(3);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    await write();
    await write(receipt(), [movement({ kind: "refund_return" })]);
    await write();
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    expect(data.rows).toHaveLength(4);
  });
  it("refuses a later refund that mismatches its returned-fund tombstone principal or charge", async () => {
    const data = await setup();
    await write(receipt(), [movement({ kind: "refund_return" })]);
    for (const extra of [{ amount_cents: 1000 }, { charge_id: "ch_other" }])
      await expect(write(receipt(), [movement(extra)])).rejects.toMatchObject({
        code: "PAID_ALLOWANCE_SYNC_REQUIRED",
      });
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    expect(data.rows).toHaveLength(3);
  });
  it("does not apply an old invoice's hold to an independently paid renewal", async () => {
    const data = await setup();
    await write();
    const next = receipt({
      invoice_id: "in_renewal",
      period_start: end,
      period_end: Date.parse("2026-11-30T12:00:00Z") / 1000,
    });
    await recordPaidAllowanceReceipt("tenant", next);
    await expect(
      resolveAllowanceWindow(data.db, "tenant", new Date(end * 1000)),
    ).resolves.toMatchObject({ key: `paid:sub_paid:${end}` });
    data.billing.tenant.status = "canceled";
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toMatchObject({
      key: "2026-10",
    });
  });
  it("does not revive an expired period or a deleted canonical receipt after funds return", async () => {
    const data = await setup();
    const original = movement({ kind: "dispute_withdrawal", reference: "dp_expired" });
    await write(receipt(), [original]);
    await write(receipt(), [{ ...original, kind: "dispute_reinstatement" }]);
    await expect(
      resolveAllowanceWindow(data.db, "tenant", new Date(end * 1000)),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    data.rows.splice(0);
    await expect(
      write(receipt(), [{ ...original, kind: "dispute_reinstatement" }]),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    expect(data.rows).toHaveLength(0);
  });
  it("accounts for multiple invoice payments without confusing a partial payment refund with full reversal", async () => {
    const data = await setup();
    await write(receipt(), [
      movement({
        charge_id: "ch_one",
        payment_intent_id: "pi_one",
        charge_cents: 1000,
        amount_cents: 1000,
      }),
    ]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    await write(receipt(), [
      movement({
        reference: "re_two",
        charge_id: "ch_two",
        payment_intent_id: "pi_two",
        charge_cents: 900,
        amount_cents: 900,
      }),
    ]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
    });
  });
  it("caps overlapping refund/dispute principal and retains a full refund after dispute funds return", async () => {
    const data = await setup();
    await write(receipt(), [
      movement(),
      movement({ kind: "dispute_withdrawal", reference: "dp_overlap" }),
      movement({ kind: "dispute_reinstatement", reference: "dp_overlap" }),
    ]);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
    });
  });
  it("serializes a reversal with admitted voice and managed-AI reservation without reverse lock order", async () => {
    const data = await setup();
    const voiceAdmitted = deferred();
    const finishVoiceAdmission = deferred();
    const voice = data.db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"tenant"}))`);
      await resolveAllowanceWindow(tx, "tenant", now);
      voiceAdmitted.resolve();
      await finishVoiceAdmission.promise;
    });
    await voiceAdmitted.promise;
    const reversal = write();
    await vi.waitFor(() => expect(data.events).toContain("locked:budget:tenant"));
    let aiAdmitted = false;
    const ai = data.db.transaction(async (tx: any) => {
      await tx
        .select({ userId: schema.spendBudgets.userId })
        .from(schema.spendBudgets)
        .where(eq(schema.spendBudgets.userId, "tenant"))
        .limit(1)
        .for("update");
      await resolveAllowanceWindow(tx, "tenant", now);
      aiAdmitted = true;
    });
    const aiResult = expect(ai).rejects.toMatchObject({ code: "PAID_ALLOWANCE_FUNDING_REVERSED" });
    finishVoiceAdmission.resolve();
    await voice;
    await reversal;
    await aiResult;
    expect(aiAdmitted).toBe(false);
  });
});

function provider(r = receipt()) {
  const invoice: any = {
    id: r.invoice_id,
    customer: r.customer_id,
    status: "paid",
    amount_paid: 1900,
    currency: "usd",
    livemode: false,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: r.subscription_id },
    },
    lines: {
      has_more: false,
      data: [
        {
          amount: 1900,
          period: { start: r.period_start, end: r.period_end },
          pricing: { type: "price_details", price_details: { price: r.price_id } },
        },
      ],
    },
  };
  const charge: any = {
    id: "ch_paid",
    invoice: r.invoice_id,
    customer: r.customer_id,
    paid: true,
    amount: 1900,
    currency: "usd",
    livemode: false,
    payment_intent: "pi_paid",
    metadata: { wireline_user_id: "attacker" },
  };
  const refunds: any[] = [
    { id: "re_paid", charge: "ch_paid", amount: 1900, currency: "usd", status: "succeeded" },
  ];
  const stripe = {
    charges: { retrieve: vi.fn(async () => charge) },
    invoices: { retrieve: vi.fn(async () => invoice) },
    refunds: { list: vi.fn(async () => ({ data: refunds, has_more: false })) },
  } as unknown as Stripe;
  return {
    invoice,
    charge,
    refunds,
    stripe,
    run: (dispute?: any) =>
      reconcilePaidAllowanceFundingForCharge({
        stripe,
        chargeId: "ch_paid",
        providerEventId: "evt_refund",
        dispute,
      }),
  };
}

describe("authoritative Stripe paid funding reconciliation", () => {
  it("a newer returned-fund snapshot overtakes an older succeeded read without reviving a hold", async () => {
    const data = await setup();
    const p = provider();
    const oldSnapshot = [{ ...p.refunds[0] }];
    const oldFetched = deferred();
    const releaseOldFetch = deferred();
    vi.mocked(p.stripe.refunds.list).mockImplementationOnce(async () => {
      oldFetched.resolve();
      await releaseOldFetch.promise;
      return { data: oldSnapshot, has_more: false } as never;
    });
    const oldHandler = p.run();
    await oldFetched.promise;
    p.refunds[0].status = "failed";
    p.refunds[0].failure_balance_transaction = "txn_return";
    await p.run();
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    releaseOldFetch.resolve();
    await oldHandler;
    // No later webhook/reconcile may be needed to repair this ordering.
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    await p.run();
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    expect(data.rows.filter((row) => row.refType === "paid_plan_funding_movement")).toHaveLength(2);
    expect(data.rows.reduce((sum, row) => sum + Number(row.deltaUsd), 0)).toBe(12.34);
  });
  it.each(["addon", "proration"])(
    "does not apply an unrelated %s invoice to a paid period",
    async (kind) => {
      const data = database();
      const p = provider();
      if (kind === "addon") p.invoice.lines.data[0].pricing.price_details.price = "price_addon";
      else p.invoice.lines.data[0].parent = { subscription_item_details: { proration: true } };
      await expect(p.run()).resolves.toBe(false);
      expect(data.rows).toHaveLength(0);
    },
  );
  it("uses canonical invoice ownership, never mutable payment metadata, and handles late failed refunds", async () => {
    const data = await setup();
    const p = provider();
    await expect(p.run()).resolves.toBe(true);
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_FUNDING_REVERSED",
    });
    p.refunds[0].status = "failed";
    p.refunds[0].failure_balance_transaction = "txn_return";
    await p.run();
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    expect(
      data.rows
        .filter((row) => row.refType === "paid_plan_funding_movement")
        .every((row) => row.userId === "tenant"),
    ).toBe(true);
  });
  it.each(["pending", "failed", "canceled"])(
    "does not revoke for a %s refund without returned/succeeded proof",
    async (status) => {
      const data = await setup();
      const p = provider();
      p.refunds[0].status = status;
      await p.run();
      await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
      expect(data.rows).toHaveLength(2);
    },
  );
  it("reconciles out-of-order dispute reinstatement from authoritative withdrawal and return transactions", async () => {
    const data = await setup();
    const p = provider();
    p.refunds.length = 0;
    await p.run({
      id: "dp_paid",
      charge: "ch_paid",
      payment_intent: "pi_paid",
      amount: 1900,
      currency: "usd",
      balance_transactions: [
        { amount: -1900, currency: "usd" },
        { amount: 1900, currency: "usd" },
      ],
    });
    await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
    expect(data.rows).toHaveLength(4);
  });
  it.each(["customer", "invoice", "currency", "mode", "overpayment"])(
    "refuses mismatched %s provenance",
    async (kind) => {
      const data = await setup();
      const p = provider();
      if (kind === "customer") p.charge.customer = "cus_other";
      if (kind === "invoice") p.invoice.id = "in_other";
      if (kind === "currency") p.charge.currency = "eur";
      if (kind === "mode") p.charge.livemode = true;
      if (kind === "overpayment") p.charge.amount = 2000;
      await expect(p.run()).rejects.toThrow(/identity|provenance/);
      expect(data.rows).toHaveLength(2);
    },
  );
  it("keeps a channel invoice without a canonical receipt retryable", async () => {
    const data = database();
    const p = provider();
    await expect(p.run()).rejects.toThrow(/awaiting its canonical/);
    expect(data.rows).toHaveLength(0);
  });
  it("does not persist any movements when a later refund page fails", async () => {
    const data = await setup();
    const p = provider();
    vi.mocked(p.stripe.refunds.list)
      .mockImplementationOnce(async () => ({ data: p.refunds, has_more: true }) as any)
      .mockRejectedValueOnce(new Error("Stripe unavailable"));
    await expect(p.run()).rejects.toThrow("Stripe unavailable");
    expect(data.rows).toHaveLength(2);
  });
  it.each(["charge.refunded", "refund.failed"])(
    "routes signed %s through canonical funding without a fabricated wallet debit",
    async (type) => {
      const data = await setup();
      const p = provider();
      if (type === "refund.failed") {
        await p.run();
        p.refunds[0].status = "failed";
        p.refunds[0].failure_balance_transaction = "txn_return";
      }
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "unit-only");
      vi.spyOn(stripeHelpers, "stripeAvailable").mockReturnValue(true);
      vi.spyOn(stripeHelpers.stripe.webhooks, "constructEvent").mockReturnValue({
        id: "evt_paid",
        type,
        data: { object: type === "charge.refunded" ? p.charge : p.refunds[0] },
      } as unknown as Stripe.Event);
      vi.spyOn(stripeHelpers.stripe.charges, "retrieve").mockResolvedValue(p.charge);
      vi.spyOn(stripeHelpers.stripe.invoices, "retrieve").mockResolvedValue(p.invoice);
      vi.spyOn(stripeHelpers.stripe.refunds, "list").mockResolvedValue({
        data: p.refunds,
        has_more: false,
      } as never);
      vi.spyOn(stripeHelpers.stripe.paymentIntents, "retrieve").mockResolvedValue({
        id: "pi_paid",
        metadata: { purpose: "credit_topup", wireline_user_id: "attacker" },
      } as never);
      const debit = vi.spyOn(wallet, "reverseCredit");
      const json = vi.fn();
      const next = vi.fn();
      await stripeRuntimeAllowanceRetryPreflight(
        {
          method: "POST",
          body: Buffer.from("{}"),
          headers: { "stripe-signature": "unit-only" },
        } as Request,
        { json } as unknown as Response,
        next,
      );
      expect(next).not.toHaveBeenCalled();
      expect(debit).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({
        received: true,
        runtime_allowance_reversal: false,
        paid_allowance_funding_reconciled: true,
      });
      expect(claims.complete).toHaveBeenCalledOnce();
      expect(claims.release).not.toHaveBeenCalled();
      if (type === "refund.failed")
        await expect(resolveAllowanceWindow(data.db, "tenant", now)).resolves.toBeTruthy();
      else
        await expect(resolveAllowanceWindow(data.db, "tenant", now)).rejects.toMatchObject({
          code: "PAID_ALLOWANCE_FUNDING_REVERSED",
        });
    },
  );
  it("releases standalone top-up return events to the existing billing owner", async () => {
    await setup();
    const p = provider();
    p.refunds[0].status = "failed";
    p.refunds[0].failure_balance_transaction = "txn_return";
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "unit-only");
    vi.spyOn(stripeHelpers, "stripeAvailable").mockReturnValue(true);
    vi.spyOn(stripeHelpers, "stripeInvoiceIdForCharge").mockResolvedValue(null);
    vi.spyOn(stripeHelpers.stripe.webhooks, "constructEvent").mockReturnValue({
      id: "evt_topup_return",
      type: "refund.failed",
      data: { object: p.refunds[0] },
    } as unknown as Stripe.Event);
    vi.spyOn(stripeHelpers.stripe.charges, "retrieve").mockResolvedValue(p.charge);
    vi.spyOn(stripeHelpers.stripe.paymentIntents, "retrieve").mockResolvedValue({
      id: "pi_topup",
      metadata: { purpose: "credit_topup", wireline_user_id: "tenant" },
    } as never);
    const json = vi.fn();
    const next = vi.fn();
    await stripeRuntimeAllowanceRetryPreflight(
      {
        method: "POST",
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "unit-only" },
      } as Request,
      { json } as unknown as Response,
      next,
    );
    expect(claims.release).toHaveBeenCalledOnce();
    expect(claims.complete).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
  });
});
