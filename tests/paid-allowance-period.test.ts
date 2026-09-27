import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
}));
import {
  paidAllowanceWindow,
  recordPaidAllowanceReceipt,
  resolveAllowanceWindow,
  verifiedPaidAllowanceReceipt,
  type PaidAllowanceReceipt,
} from "../src/lib/paid-allowance-period";
import { planById } from "../src/lib/plan-catalog";

const unix = (iso: string) => Date.parse(iso) / 1000;
const receipt = (
  start = "2026-09-30T12:00:00Z",
  end = "2026-10-30T12:00:00Z",
  interval: "month" | "year" = "month",
): PaidAllowanceReceipt => ({
  version: 1,
  subscription_id: "sub_paid",
  customer_id: "cus_paid",
  price_id: "price_paid",
  invoice_id: "in_paid",
  plan_id: "voice-high",
  interval,
  period_start: unix(start),
  period_end: unix(end),
});
function stripeObjects(r = receipt()) {
  const sub = {
    id: r.subscription_id,
    customer: r.customer_id,
    status: "active",
    latest_invoice: r.invoice_id,
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: r.period_start,
          current_period_end: r.period_end,
          price: { id: r.price_id, recurring: { interval: r.interval, interval_count: 1 } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  const invoice = {
    id: r.invoice_id,
    customer: r.customer_id,
    status: "paid",
    amount_remaining: 0,
    parent: { subscription_details: { subscription: r.subscription_id } },
    lines: {
      has_more: false,
      data: [
        {
          amount: 11500,
          pricing: { price_details: { price: r.price_id } },
          period: { start: r.period_start, end: r.period_end },
        },
      ],
    },
  } as unknown as Stripe.Invoice;
  return { sub, invoice };
}

describe("paid period proof", () => {
  it("accepts only an exact paid base invoice and supports the legacy period shape", () => {
    const { sub, invoice } = stripeObjects();
    expect(
      verifiedPaidAllowanceReceipt(sub, planById("voice-high")!, "price_paid", invoice),
    ).toEqual(receipt());
    const compat = sub as any;
    compat.current_period_start = sub.items.data[0].current_period_start;
    compat.current_period_end = sub.items.data[0].current_period_end;
    delete compat.items.data[0].current_period_start;
    delete compat.items.data[0].current_period_end;
    expect(
      verifiedPaidAllowanceReceipt(sub, planById("voice-high")!, "price_paid", invoice),
    ).toEqual(receipt());
  });
  it.each([
    [
      "unpaid",
      (s: any, i: any) => {
        i.status = "open";
      },
    ],
    [
      "remaining amount",
      (s: any, i: any) => {
        i.amount_remaining = 100;
      },
    ],
    [
      "different customer",
      (s: any, i: any) => {
        i.customer = "cus_other";
      },
    ],
    [
      "different subscription",
      (s: any, i: any) => {
        i.parent.subscription_details.subscription = "sub_other";
      },
    ],
    [
      "stale invoice",
      (s: any, i: any) => {
        i.id = "in_old";
      },
    ],
    [
      "different price",
      (s: any, i: any) => {
        i.lines.data[0].pricing.price_details.price = "price_other";
      },
    ],
    [
      "old period",
      (s: any, i: any) => {
        i.lines.data[0].period.start -= 86400;
      },
    ],
    [
      "partial period",
      (s: any, i: any) => {
        i.lines.data[0].period.end -= 86400;
      },
    ],
    [
      "proration",
      (s: any, i: any) => {
        i.lines.data[0].proration = true;
      },
    ],
    [
      "zero-cost line",
      (s: any, i: any) => {
        i.lines.data[0].amount = 0;
      },
    ],
    [
      "incomplete lines",
      (s: any, i: any) => {
        i.lines.has_more = true;
      },
    ],
    [
      "trial",
      (s: any) => {
        s.status = "trialing";
      },
    ],
  ])("does not create paid allowance proof for %s", (_label, mutate) => {
    const { sub, invoice } = stripeObjects();
    mutate(sub, invoice);
    expect(
      verifiedPaidAllowanceReceipt(sub, planById("voice-high")!, "price_paid", invoice),
    ).toBeNull();
  });
  it("accepts a Jan31-anchored monthly renewal from February28 to March31", () => {
    const r = receipt("2027-02-28T12:00:00Z", "2027-03-31T12:00:00Z");
    const { sub, invoice } = stripeObjects(r);
    expect(
      verifiedPaidAllowanceReceipt(sub, planById("voice-high")!, "price_paid", invoice),
    ).toEqual(r);
  });
});

describe("monthly anniversary windows", () => {
  it("does not replenish a September30 payment at the October calendar boundary", () => {
    const r = receipt();
    expect(paidAllowanceWindow(r, new Date("2026-10-01T00:00:00Z"))?.key).toBe(
      paidAllowanceWindow(r, new Date("2026-09-30T13:00:00Z"))?.key,
    );
    expect(paidAllowanceWindow(r, new Date("2026-10-30T12:00:00Z"))).toBeNull();
  });
  it.each([
    [
      "2028-01-31T12:30:15Z",
      "2029-01-31T12:30:15Z",
      "2028-02-29T12:30:14Z",
      "2028-01-31T12:30:15Z",
      "2028-02-29T12:30:15Z",
    ],
    [
      "2028-01-31T12:30:15Z",
      "2029-01-31T12:30:15Z",
      "2028-02-29T12:30:15Z",
      "2028-02-29T12:30:15Z",
      "2028-03-31T12:30:15Z",
    ],
    [
      "2026-01-31T12:00:00Z",
      "2027-01-31T12:00:00Z",
      "2026-03-31T12:00:00Z",
      "2026-03-31T12:00:00Z",
      "2026-04-30T12:00:00Z",
    ],
    [
      "2026-12-31T12:00:00Z",
      "2027-12-31T12:00:00Z",
      "2027-02-28T12:00:00Z",
      "2027-02-28T12:00:00Z",
      "2027-03-31T12:00:00Z",
    ],
  ])(
    "clamps annual slices without day/time drift (%s, %s, %s)",
    (start, end, now, expectedStart, expectedEnd) => {
      const window = paidAllowanceWindow(receipt(start, end, "year"), new Date(now));
      expect(window?.start).toEqual(new Date(expectedStart));
      expect(window?.end).toEqual(new Date(expectedEnd));
    },
  );
  it("expires an annual receipt at the paid end and never adds a thirteenth pool", () => {
    const r = receipt("2028-02-29T12:00:00Z", "2029-02-28T12:00:00Z", "year");
    expect(paidAllowanceWindow(r, new Date("2029-02-28T11:59:59Z"))?.start.toISOString()).toBe(
      "2029-01-29T12:00:00.000Z",
    );
    expect(paidAllowanceWindow(r, new Date("2029-02-28T12:00:00Z"))).toBeNull();
  });
  it("rejects extended annual evidence and never opens a thirteenth partial pool", () => {
    const r = receipt("2026-01-01T00:00:00Z", "2027-01-03T00:00:00Z", "year");
    const { sub, invoice } = stripeObjects(r);
    expect(
      verifiedPaidAllowanceReceipt(sub, planById("voice-high")!, "price_paid", invoice),
    ).toBeNull();
    expect(paidAllowanceWindow(r, new Date("2027-01-02T00:00:00Z"))).toBeNull();
  });
});

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
  const dialect = new PgDialect();
  const locks: unknown[] = [];
  const db: any = {
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
    execute: async (statement: any) => {
      locks.push(dialect.sqlToQuery(statement).params[0]);
    },
    select: (selection: any) => {
      let table: string;
      let filter: { sql: string; params: unknown[] };
      const q: any = {
        from: (source: any) => {
          table = getTableName(source);
          return q;
        },
        where: (value: any) => {
          filter = dialect.sqlToQuery(value);
          return q;
        },
        limit: () => q,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              const user = String(filter.params[0]);
              if (table === "wireline_subscriptions") return billing[user] ? [billing[user]] : [];
              const own = rows.filter((row) => row.userId === user);
              if (selection.balance)
                return [
                  { balance: String(own.reduce((sum, row) => sum + Number(row.deltaUsd), 0)) },
                ];
              return own.filter(
                (row) =>
                  row.refType === filter.params[1] &&
                  (filter.sql.includes('"ref_id"')
                    ? row.refId === filter.params[2]
                    : row.metadata.subscription_id === filter.params[2]),
              );
            })
            .then(resolve),
      };
      return q;
    },
    insert: () => ({
      values: (row: any) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (
              !rows.some(
                (old) => old.userId === row.userId && old.idempotencyKey === row.idempotencyKey,
              )
            ) {
              rows.push(row);
              return [{ id: rows.length }];
            }
            return [];
          },
        }),
      }),
    }),
  };
  h.db = db;
  return { db, rows, billing, locks };
}
beforeEach(() => {
  h.db = null;
});
describe("durable tenant allowance receipts", () => {
  it("refuses an incompatible same-period conflict instead of acknowledging lost allowance evidence", async () => {
    const data = database();
    await recordPaidAllowanceReceipt("tenant", receipt());
    await expect(
      recordPaidAllowanceReceipt("tenant", { ...receipt(), plan_id: "voice-regular" }),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].metadata.plan_id).toBe("voice-high");
  });
  it("writes one zero-dollar receipt on replay, preserves the wallet and resolves only its tenant", async () => {
    const data = database();
    data.rows.push({ userId: "tenant", deltaUsd: "12.34", refType: "top_up", metadata: {} });
    await recordPaidAllowanceReceipt("tenant", receipt());
    await recordPaidAllowanceReceipt("tenant", receipt());
    expect(data.rows).toHaveLength(2);
    expect(data.rows[1]).toMatchObject({
      deltaUsd: "0",
      balanceAfterUsd: "12.34",
      refType: "paid_plan_allowance",
    });
    expect(data.locks).toEqual(["tenant", "tenant"]);
    const now = new Date("2026-10-01T00:00:00Z");
    expect((await resolveAllowanceWindow(data.db, "tenant", now)).end.toISOString()).toBe(
      "2026-10-30T12:00:00.000Z",
    );
    data.billing.other = { ...data.billing.tenant };
    await expect(resolveAllowanceWindow(data.db, "other", now)).rejects.toMatchObject({
      code: "PAID_ALLOWANCE_SYNC_REQUIRED",
    });
  });
  it("does not refill an expired unpaid renewal or use a previous plan's capacity receipt", async () => {
    const data = database();
    await recordPaidAllowanceReceipt("tenant", receipt());
    await expect(
      resolveAllowanceWindow(data.db, "tenant", new Date("2026-10-30T12:00:00Z")),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
    data.billing.tenant.plan = "voice-regular";
    await expect(
      resolveAllowanceWindow(data.db, "tenant", new Date("2026-10-01T00:00:00Z")),
    ).rejects.toMatchObject({ code: "PAID_ALLOWANCE_SYNC_REQUIRED" });
  });
  it("starts renewed capacity only with the matching paid next-period receipt", async () => {
    const data = database();
    await recordPaidAllowanceReceipt("tenant", receipt());
    const next = {
      ...receipt("2026-10-30T12:00:00Z", "2026-11-30T12:00:00Z"),
      invoice_id: "in_next",
      plan_id: "voice-regular",
    };
    await recordPaidAllowanceReceipt("tenant", next);
    data.billing.tenant.plan = next.plan_id;
    expect(
      (await resolveAllowanceWindow(data.db, "tenant", new Date("2026-10-30T12:00:00Z"))).key,
    ).toBe(`paid:sub_paid:${next.period_start}`);
  });
  it.each(["personal", "starter", "team"])(
    "retains %s calendar behavior without paid receipts",
    async (plan) => {
      const data = database();
      data.billing.tenant.plan = plan;
      expect(
        (await resolveAllowanceWindow(data.db, "tenant", new Date("2026-10-01T00:00:00Z"))).key,
      ).toBe("2026-10");
    },
  );
  it("retains Free Builder private work for canceled channel subscribers", async () => {
    const data = database();
    data.billing.tenant.status = "canceled";
    expect(
      (await resolveAllowanceWindow(data.db, "tenant", new Date("2026-10-01T00:00:00Z"))).key,
    ).toBe("2026-10");
  });
});
