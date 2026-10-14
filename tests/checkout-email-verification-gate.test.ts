import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as unknown[], fail: false }));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (db.fail) throw new Error("database unavailable");
            return db.rows;
          },
        }),
      }),
    }),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { enforceVerifiedEmailForCheckout } from "../src/lib/trial-gate";

function run(userId = "user-1") {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return {
    done: enforceVerifiedEmailForCheckout(
      { user: { id: userId } } as unknown as Request,
      res,
      next,
    ),
    res,
    json,
    next,
  };
}

beforeEach(() => {
  db.rows = [];
  db.fail = false;
});

describe("checkout email verification gate", () => {
  it("sends an unverified account to verification before any payment starts", async () => {
    db.rows = [{ verifiedAt: null }];
    const { done, res, json, next } = run();
    await done;

    expect(res.status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "EMAIL_UNVERIFIED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a verified account continue to checkout", async () => {
    db.rows = [{ verifiedAt: new Date("2026-10-01T00:00:00Z") }];
    const { done, res, next } = run();
    await done;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails closed with a retryable error when the account cannot be read", async () => {
    db.fail = true;
    const { done, res, json, next } = run();
    await done;

    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BILLING_STATE_UNAVAILABLE", retryable: true }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    "src/routes/launch-billing-checkout-atomic-routes.ts",
    "src/routes/launch-billing-checkout-routes.ts",
  ])("guards every plan checkout route: %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const start = source.indexOf('"/api/billing/checkout",');
    const chain = source.slice(start, source.indexOf("async (req", start));

    expect(start).toBeGreaterThan(-1);
    expect(chain.indexOf("authenticateUser")).toBeLessThan(
      chain.indexOf("enforceVerifiedEmailForCheckout"),
    );
    expect(chain.indexOf("enforceVerifiedEmailForCheckout")).toBeLessThan(
      chain.indexOf("fencePayableBillingDuringAccountDeletion"),
    );
  });
});
