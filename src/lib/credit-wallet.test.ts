import { describe, expect, it, vi, beforeEach } from "vitest";

// Configurable drizzle mock: `balance` feeds the SUM query; `inserted` is what
// the insert().returning() yields ([] simulates an idempotent conflict).
const h = vi.hoisted(() => {
  const state = { balance: 0, inserted: [{ id: "row-1" }] as Array<{ id: string }> };

  const selectBuilder = () => {
    const b: any = {};
    for (const m of ["from", "where", "orderBy", "limit"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve([{ balance: String(state.balance) }]).then(res, rej);
    return b;
  };
  const insertBuilder = () => {
    const b: any = {};
    b.values = () => b;
    b.onConflictDoNothing = () => b;
    b.returning = () => Promise.resolve(state.inserted);
    return b;
  };
  const txLike = {
    execute: vi.fn(async () => undefined),
    select: () => selectBuilder(),
    insert: () => insertBuilder(),
  };
  const drizzle = {
    select: () => selectBuilder(),
    transaction: (cb: (tx: unknown) => unknown) => Promise.resolve(cb(txLike)),
  };
  return { state, drizzle, txLike };
});

vi.mock("./server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getCreditBalanceUsd, debitForOverage, addCredit } from "./credit-wallet";

describe("credit-wallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.balance = 0;
    h.state.inserted = [{ id: "row-1" }];
  });

  it("reads the summed balance", async () => {
    h.state.balance = 12.5;
    expect(await getCreditBalanceUsd("u1")).toBe(12.5);
  });

  it("debits overage when the balance fully covers it", async () => {
    h.state.balance = 10;
    const debited = await debitForOverage("u1", 0.6, "call-1");
    expect(debited).toBe(0.6);
    expect(h.txLike.execute).toHaveBeenCalled(); // advisory lock taken
  });

  it("skips the debit (returns 0) when the balance can't cover the full cost", async () => {
    h.state.balance = 0.5;
    const debited = await debitForOverage("u1", 0.6, "call-1");
    expect(debited).toBe(0);
  });

  it("is idempotent — a conflicting debit returns 0", async () => {
    h.state.balance = 10;
    h.state.inserted = []; // simulate ON CONFLICT DO NOTHING
    expect(await debitForOverage("u1", 0.6, "call-1")).toBe(0);
  });

  it("adds credit and returns the new balance", async () => {
    h.state.balance = 4;
    expect(await addCredit("u1", 5, "web_topup", { type: "stripe", id: "cs_1" })).toBe(9);
  });

  it("ignores non-positive credit amounts", async () => {
    h.state.balance = 7;
    expect(await addCredit("u1", 0, "noop")).toBe(7);
  });
});
