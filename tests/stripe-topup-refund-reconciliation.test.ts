import { getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null as any, tenant: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  tenantStore: {
    run: (user: string, work: () => unknown) => {
      h.tenant(user);
      return work();
    },
  },
}));
import {
  hasPostedStripeTopUpCredit,
  reconcileStripeTopUpRefunds,
  resolveStripeTopUpCredit,
} from "../src/lib/stripe-topup-refund-reconciliation";
import { proportionalTopUpCreditUsd } from "../src/lib/stripe-dispute-accounting";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const refund = (extra: Record<string, unknown> = {}) => ({
  id: "re_topup",
  charge: "ch_topup",
  payment_intent: "pi_topup",
  currency: "usd",
  amount: 1000,
  status: "succeeded",
  ...extra,
});
function setup() {
  const rows: any[] = [
    {
      id: "credit_original",
      userId: "owner",
      deltaUsd: "10",
      refType: "stripe_session",
      refId: "cs_topup",
      entryKind: "top_up",
      reason: "web_topup",
      provider: "stripe",
      providerObjectId: "cs_topup",
      metadata: { payment_intent: "pi_topup", checkout_session_id: "cs_topup" },
    },
  ];
  const events: string[] = [];
  const queues = new Map<string, Promise<void>>();
  const dialect = new PgDialect();
  const client = (held?: Map<string, () => void>, inserted: any[] = []) => {
    const db: any = {
      transaction: async (work: (tx: any) => unknown) => {
        const locks = new Map<string, () => void>();
        const own: any[] = [];
        try {
          return await work(client(locks, own));
        } catch (error) {
          for (const row of own) rows.splice(rows.indexOf(row), 1);
          throw error;
        } finally {
          for (const release of locks.values()) release();
        }
      },
      execute: async (value: any) => {
        const key = String(dialect.sqlToQuery(value).params[0]);
        events.push(`attempt:${key}`);
        if (!held || held.has(key)) return;
        const previous = queues.get(key) ?? Promise.resolve();
        const next = deferred();
        queues.set(key, next.promise);
        await previous;
        held.set(key, next.resolve);
        events.push(`locked:${key}`);
      },
      select: (selection?: any) => {
        let query = { sql: "", params: [] as unknown[] };
        let limit = Infinity;
        const q: any = {
          from: (table: any) => {
            expect(getTableName(table)).toBe("wireline_credit_ledger");
            return q;
          },
          where: (value: any) => {
            query = dialect.sqlToQuery(value);
            return q;
          },
          limit: (value: number) => {
            limit = value;
            return q;
          },
          then: (done: any, fail: any) =>
            Promise.resolve()
              .then(() => {
                const p = query.params;
                if (query.sql.includes("->>'payment_intent'"))
                  return rows
                    .filter((row) => row.refType === p[0] && row.metadata.payment_intent === p[1])
                    .slice(0, limit);
                if (query.sql.includes('"id" ='))
                  return rows.filter((row) => row.id === p[0] && row.userId === p[1]);
                const own = rows.filter((row) => row.userId === p[0]);
                if (selection?.balance)
                  return [
                    { balance: String(own.reduce((sum, row) => sum + Number(row.deltaUsd), 0)) },
                  ];
                return own.filter(
                  (row) =>
                    [p[1], p[2]].includes(row.refType) &&
                    (row.metadata.payment_intent_id === p[3] || p.slice(4).includes(row.refId)),
                );
              })
              .then(done, fail),
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
                    row.userId === value.userId &&
                    row.refType === value.refType &&
                    row.refId === value.refId,
                )
              )
                return [];
              const row = { ...value, id: `ledger_${rows.length}` };
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
  h.db = client();
  const charge: any = {
    id: "ch_topup",
    payment_intent: "pi_topup",
    customer: "cus_topup",
    amount: 1000,
    amount_refunded: 1000,
    paid: true,
    currency: "usd",
    livemode: true,
  };
  const pi: any = {
    id: "pi_topup",
    customer: "cus_topup",
    amount: 1000,
    status: "succeeded",
    currency: "usd",
    livemode: true,
    metadata: { purpose: "credit_topup", wireline_user_id: "owner", credit_usd: "10" },
  };
  const session: any = {
    id: "cs_topup",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_topup",
    customer: "cus_topup",
    amount_total: 1000,
    currency: "usd",
    livemode: true,
  };
  const stripe: any = {
    charges: { retrieve: vi.fn(async () => charge) },
    paymentIntents: { retrieve: vi.fn(async () => pi) },
    checkout: { sessions: { retrieve: vi.fn(async () => session) } },
    refunds: { list: vi.fn(async () => ({ data: [refund()], has_more: false })) },
  };
  const run = (refundId?: string) =>
    reconcileStripeTopUpRefunds({
      stripe,
      chargeId: charge.id,
      providerEventId: "evt_refund",
      ...(refundId ? { refundId } : {}),
    });
  const balance = () => rows.reduce((sum, row) => sum + Number(row.deltaUsd), 0);
  const inventory = (data: any[]) =>
    stripe.refunds.list.mockResolvedValue({ data, has_more: false });
  return { rows, events, charge, pi, session, stripe, run, balance, inventory };
}
beforeEach(() => vi.clearAllMocks());

function disputeHandlers(p: ReturnType<typeof setup>) {
  const source = ts.createSourceFile(
    "stripe-runtime-allowance-retry.ts",
    readFileSync(resolve("src/middleware/stripe-runtime-allowance-retry.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set(["reverseTopUpDisputeStrict", "restoreTopUpDisputeStrict"]);
  const nodes = source.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text),
  );
  expect(nodes).toHaveLength(2);
  const body = ts.transpileModule(nodes.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const append = (direction: number) =>
    vi.fn(async (user: string, amount: number, _reason: string, ref: any) => {
      if (
        !p.rows.some(
          (row) => row.userId === user && row.refType === ref.type && row.refId === ref.id,
        )
      )
        p.rows.push({
          userId: user,
          deltaUsd: String(direction * amount),
          refType: ref.type,
          refId: ref.id,
          metadata: ref.metadata,
        });
      return { applied: amount };
    });
  const debit = append(-1);
  const credit = append(1);
  const prior = vi.fn(async (user: string, type: string, id: string) => {
    const row = p.rows.find(
      (row) => row.userId === user && row.refType === type && row.refId === id,
    );
    return row ? Math.abs(Number(row.deltaUsd)) : null;
  });
  const handlers = new Function(
    "stripe",
    "resolveStripeTopUpCredit",
    "proportionalTopUpCreditUsd",
    "tenantStore",
    "reverseCredit",
    "addCredit",
    "ledgerMovementAmountUsd",
    `${body}\nreturn { reverseTopUpDisputeStrict, restoreTopUpDisputeStrict };`,
  )(
    p.stripe,
    resolveStripeTopUpCredit,
    proportionalTopUpCreditUsd,
    {
      run: (user: string, work: () => unknown) => {
        h.tenant(user);
        return work();
      },
    },
    debit,
    credit,
    prior,
  );
  return { ...handlers, debit, credit, prior };
}

describe("canonical standalone Runtime Balance refund reconciliation", () => {
  it("debits succeeded credit once and restores only that debit after authoritative failure", async () => {
    const p = setup();
    await p.run();
    await p.run();
    expect(p.balance()).toBe(0);
    p.inventory([refund({ status: "failed", failure_balance_transaction: "txn_return" })]);
    await p.run("re_topup");
    await p.run();
    expect(p.balance()).toBe(10);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[2]).toMatchObject({
      refType: "stripe_refund_return",
      deltaUsd: "10",
      providerObjectId: "re_topup",
      providerEventId: "evt_refund",
      metadata: {
        original_credit_id: "credit_original",
        refund_cents: 1000,
        failure_balance_transaction: "txn_return",
      },
    });
    expect(p.rows[0].deltaUsd).toBe("10");
  });
  it("also restores canceled refunds only when Stripe proves funds returned", async () => {
    const p = setup();
    await p.run();
    p.inventory([
      refund({ status: "canceled", failure_balance_transaction: { id: "txn_return" } }),
    ]);
    await p.run();
    expect(p.balance()).toBe(10);
  });
  it("does not mint credit for failed-before-settlement or pending refunds", async () => {
    const p = setup();
    p.charge.amount_refunded = 0;
    p.inventory([refund({ status: "failed" }), refund({ id: "re_pending", status: "pending" })]);
    await p.run();
    expect(p.rows).toHaveLength(1);
    expect(p.balance()).toBe(10);
    p.inventory([refund()]);
    await p.run();
    expect(p.balance()).toBe(0);
  });
  it("leaves a failed previously-debited refund retryable without returned-funds proof", async () => {
    const p = setup();
    await p.run();
    p.charge.amount_refunded = 0;
    p.inventory([refund({ status: "failed" })]);
    await expect(p.run()).rejects.toThrow("returned-funds proof");
    expect(p.rows).toHaveLength(2);
  });
  it("persists returned-first proof without gifting credit or allowing a later success replay", async () => {
    const p = setup();
    p.inventory([refund({ status: "failed", failure_balance_transaction: "txn_return" })]);
    await p.run();
    expect(p.rows[1].deltaUsd).toBe("0");
    p.inventory([refund()]);
    await p.run();
    expect(p.balance()).toBe(10);
    expect(p.rows).toHaveLength(2);
  });
  it("a returned handler overtaking a stale succeeded read prevents debit before any healing replay", async () => {
    const p = setup();
    const fetched = deferred();
    const release = deferred();
    p.stripe.refunds.list.mockImplementationOnce(async () => {
      fetched.resolve();
      await release.promise;
      return { data: [refund()], has_more: false };
    });
    const old = p.run();
    await fetched.promise;
    p.inventory([refund({ status: "failed", failure_balance_transaction: "txn_return" })]);
    await p.run();
    release.resolve();
    await old;
    expect(p.balance()).toBe(10);
    expect(p.rows).toHaveLength(2);
    await p.run();
    expect(p.rows).toHaveLength(2);
  });
  it("uses posted owner and credit even when all current financial metadata is forged or absent", async () => {
    const p = setup();
    p.pi.metadata = { wireline_user_id: "victim", credit_usd: "1000" };
    p.charge.amount = p.pi.amount = p.session.amount_total = 1200;
    p.inventory([refund({ amount: 1200 })]);
    await p.run();
    expect(p.balance()).toBe(0);
    expect(p.rows[1]).toMatchObject({ userId: "owner", deltaUsd: "-10" });
    expect(h.tenant).toHaveBeenCalledWith("owner");
    expect(h.tenant).not.toHaveBeenCalledWith("victim");
  });
  it("scales tax and cumulative partial refunds against only the actual posted grant", async () => {
    const p = setup();
    p.charge.amount = p.pi.amount = p.session.amount_total = 1200;
    p.inventory([refund({ amount: 600 }), refund({ id: "re_second", amount: 600 })]);
    await p.run();
    expect(p.balance()).toBe(0);
    expect(p.rows.slice(1).map((row) => row.deltaUsd)).toEqual(["-5", "-5"]);
    p.inventory([
      refund({ amount: 600, status: "failed", failure_balance_transaction: "txn_return" }),
      refund({ id: "re_second", amount: 600 }),
    ]);
    await p.run();
    expect(p.balance()).toBe(5);
  });
  it("processes a returned old refund before its replacement regardless of provider list order", async () => {
    const p = setup();
    await p.run();
    p.inventory([
      refund({ id: "re_replacement" }),
      refund({ status: "failed", failure_balance_transaction: "txn_return" }),
    ]);
    await p.run();
    expect(p.balance()).toBe(0);
    expect(p.rows.slice(2).map((row) => row.deltaUsd)).toEqual(["10", "-10"]);
  });
  it("keeps downward-cent rounding customer-favoring across fully refunded split principal", async () => {
    const p = setup();
    p.charge.amount = p.pi.amount = p.session.amount_total = 1200;
    p.inventory([refund({ amount: 601 }), refund({ id: "re_two", amount: 599 })]);
    await p.run();
    expect(p.balance()).toBeCloseTo(0.01);
    expect(p.rows.slice(1).map((row) => row.deltaUsd)).toEqual(["-5", "-4.99"]);
  });
  it("ignores a truncated inline collection and paginates the full refund inventory", async () => {
    const p = setup();
    p.charge.refunds = { data: [refund({ amount: 500 })], has_more: true };
    p.stripe.refunds.list
      .mockResolvedValueOnce({
        data: [
          refund({ amount: 500 }),
          refund({ id: "re_pending", amount: 100, status: "pending" }),
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [refund({ id: "re_second", amount: 500 })], has_more: false });
    await p.run();
    expect(p.balance()).toBe(0);
    expect(p.stripe.refunds.list).toHaveBeenLastCalledWith({
      charge: "ch_topup",
      limit: 100,
      starting_after: "re_pending",
    });
  });
  it("does not post partial wallet movements on pagination failure", async () => {
    const p = setup();
    p.stripe.refunds.list
      .mockResolvedValueOnce({ data: [refund({ amount: 500 })], has_more: true })
      .mockRejectedValueOnce(new Error("page unavailable"));
    await expect(p.run()).rejects.toThrow("page unavailable");
    expect(p.rows).toHaveLength(1);
    expect(p.events).toHaveLength(0);
  });
  it("rejects a nonadvancing pagination cursor and duplicated refund IDs", async () => {
    const p = setup();
    p.stripe.refunds.list.mockResolvedValue({ data: [], has_more: true });
    await expect(p.run()).rejects.toThrow("advancing cursor");
    expect(p.rows).toHaveLength(1);
    p.inventory([refund(), refund()]);
    await expect(p.run()).rejects.toThrow("duplicate");
  });
  it("retries a missing, ambiguous or malformed original receipt rather than debiting metadata's owner", async () => {
    const p = setup();
    p.rows.length = 0;
    await expect(p.run()).rejects.toThrow("original settled Checkout credit");
    const q = setup();
    q.rows.push({ ...q.rows[0], id: "other", userId: "other" });
    await expect(q.run()).rejects.toThrow("ambiguous");
    const r = setup();
    r.rows[0].deltaUsd = "0";
    await expect(r.run()).rejects.toThrow("provenance");
  });
  it("retains safe legacy session references without provider_object_id or provider stamps", async () => {
    const p = setup();
    p.rows[0].provider = null;
    p.rows[0].providerObjectId = null;
    delete p.rows[0].metadata.checkout_session_id;
    await p.run();
    expect(p.balance()).toBe(0);
  });
  it.each([
    [
      "charge customer",
      (p: ReturnType<typeof setup>) => {
        p.charge.customer = "cus_wrong";
      },
    ],
    [
      "session intent",
      (p: ReturnType<typeof setup>) => {
        p.session.payment_intent = "pi_wrong";
      },
    ],
    [
      "session identity",
      (p: ReturnType<typeof setup>) => {
        p.session.id = "cs_wrong";
      },
    ],
    [
      "currency",
      (p: ReturnType<typeof setup>) => {
        p.session.currency = "eur";
      },
    ],
    [
      "non-USD wallet",
      (p: ReturnType<typeof setup>) => {
        p.charge.currency = p.pi.currency = p.session.currency = "eur";
      },
    ],
    [
      "mode",
      (p: ReturnType<typeof setup>) => {
        p.session.livemode = false;
      },
    ],
    [
      "unpaid",
      (p: ReturnType<typeof setup>) => {
        p.session.payment_status = "unpaid";
      },
    ],
    [
      "amount",
      (p: ReturnType<typeof setup>) => {
        p.session.amount_total = 999;
      },
    ],
  ])("rejects conflicting %s provenance without a wallet write", async (_name, change) => {
    const p = setup();
    change(p);
    await expect(p.run()).rejects.toThrow("provenance");
    expect(p.rows).toHaveLength(1);
  });
  it.each([
    { charge: "ch_wrong" },
    { currency: "eur" },
    { payment_intent: "pi_wrong" },
    { amount: 1001 },
  ])("rejects conflicting refund identity %j", async (change) => {
    const p = setup();
    p.inventory([refund(change)]);
    await expect(p.run()).rejects.toThrow("provenance");
    expect(p.rows).toHaveLength(1);
  });
  it("rejects cumulative succeeded principal above the charge before locking", async () => {
    const p = setup();
    p.inventory([refund({ amount: 600 }), refund({ id: "re_two", amount: 600 })]);
    await expect(p.run()).rejects.toThrow("exceed");
    expect(p.events).toHaveLength(0);
  });
  it("rejects an event refund missing from current inventory", async () => {
    const p = setup();
    await expect(p.run("re_wrong")).rejects.toThrow("missing");
    expect(p.rows).toHaveLength(1);
  });
  it("refuses mismatched historical refund provenance or debit amounts", async () => {
    const p = setup();
    await p.run();
    p.rows[1].metadata.charge_id = "ch_wrong";
    await expect(p.run()).rejects.toThrow("conflicting provenance");
    const q = setup();
    await q.run();
    q.rows[1].deltaUsd = "-9";
    q.inventory([refund({ status: "failed", failure_balance_transaction: "txn_return" })]);
    await expect(q.run()).rejects.toThrow("does not match");
    expect(q.rows).toHaveLength(2);
  });
  it("serializes concurrent refund writers under the canonical wallet lock", async () => {
    const p = setup();
    await Promise.all([p.run(), p.run()]);
    expect(p.balance()).toBe(0);
    expect(p.rows).toHaveLength(2);
    expect(p.events.filter((event) => event === "locked:owner")).toHaveLength(2);
  });
  it("discovers canonical routing independently of purpose metadata and leaves unrelated charges alone", async () => {
    const p = setup();
    p.pi.metadata = {};
    await expect(hasPostedStripeTopUpCredit("pi_topup")).resolves.toBe(true);
    p.rows.length = 0;
    await expect(hasPostedStripeTopUpCredit("pi_topup")).resolves.toBe(false);
    await expect(p.run()).resolves.toBe(false);
    expect(p.rows).toHaveLength(0);
  });
});

describe("standalone top-up disputes share immutable credit ownership", () => {
  const dispute = {
    id: "dp_topup",
    charge: "ch_topup",
    payment_intent: "pi_topup",
    currency: "usd",
    status: "won",
  };
  it("debits the original owner and pre-tax credit despite forged current owner/amount metadata", async () => {
    const p = setup();
    p.pi.metadata = { wireline_user_id: "victim", credit_usd: "10000" };
    p.charge.amount = p.pi.amount = p.session.amount_total = 1200;
    const d = disputeHandlers(p);
    await d.reverseTopUpDisputeStrict(p.pi, dispute, 1200, "evt_withdraw");
    expect(d.debit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      10,
      "web_topup_dispute",
      expect.objectContaining({
        type: "stripe_dispute",
        id: "dp_topup",
        providerEventId: "evt_withdraw",
      }),
    );
    await d.restoreTopUpDisputeStrict(p.pi, dispute, 1200, "evt_return");
    expect(d.credit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      10,
      "web_topup_dispute_restored",
      expect.objectContaining({ type: "stripe_dispute_restoration", id: "dp_topup" }),
    );
    expect(p.balance()).toBe(10);
    expect(h.tenant).not.toHaveBeenCalledWith("victim");
  });
  it("preserves exact prior-debit cap and stable keys for legacy receipts", async () => {
    const p = setup();
    p.rows[0].provider = null;
    p.rows[0].providerObjectId = null;
    const d = disputeHandlers(p);
    await d.reverseTopUpDisputeStrict(p.pi, dispute, 500, "evt_withdraw");
    p.pi.metadata = { wireline_user_id: "victim", credit_usd: "10000" };
    await d.restoreTopUpDisputeStrict(p.pi, dispute, 1000, "evt_return");
    await d.restoreTopUpDisputeStrict(p.pi, dispute, 1000, "evt_return_duplicate");
    expect(d.credit).toHaveBeenCalledWith(
      "owner",
      5,
      "web_topup_dispute_restored",
      expect.objectContaining({ id: "dp_topup" }),
    );
    expect(p.rows.filter((row) => row.refType === "stripe_dispute_restoration")).toHaveLength(1);
    expect(p.balance()).toBe(10);
  });
  it("does not restore a different tenant's prior debit or mint a missing withdrawal", async () => {
    const p = setup();
    p.rows.push({
      userId: "victim",
      deltaUsd: "-10",
      refType: "stripe_dispute",
      refId: "dp_topup",
      metadata: {},
    });
    const d = disputeHandlers(p);
    await expect(d.restoreTopUpDisputeStrict(p.pi, dispute, 1000, "evt_return")).rejects.toThrow(
      "before its top-up withdrawal",
    );
    expect(d.credit).not.toHaveBeenCalled();
    expect(d.prior).toHaveBeenCalledWith("owner", "stripe_dispute", "dp_topup");
  });
  it("retries malformed original receipts and rejects a mismatched dispute intent", async () => {
    const p = setup();
    const d = disputeHandlers(p);
    await expect(
      d.reverseTopUpDisputeStrict(
        p.pi,
        { ...dispute, payment_intent: "pi_wrong" },
        1000,
        "evt_bad",
      ),
    ).rejects.toThrow("provenance");
    p.rows[0].deltaUsd = "0";
    await expect(d.reverseTopUpDisputeStrict(p.pi, dispute, 1000, "evt_bad")).rejects.toThrow(
      "provenance",
    );
    expect(d.debit).not.toHaveBeenCalled();
  });
});
