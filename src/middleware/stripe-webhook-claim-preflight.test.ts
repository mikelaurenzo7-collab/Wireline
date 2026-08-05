import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const deleteClaim = vi.fn(() => ({ where }));
  return {
    returning,
    where,
    deleteClaim,
    constructEvent: vi.fn(),
    next: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    and: vi.fn((...conditions: unknown[]) => ({ operator: "and", conditions })),
    eq: vi.fn((column: unknown, value: unknown) => ({ operator: "eq", column, value })),
    isNull: vi.fn((column: unknown) => ({ operator: "isNull", column })),
    lt: vi.fn((column: unknown, value: unknown) => ({ operator: "lt", column, value })),
    or: vi.fn((...conditions: unknown[]) => ({ operator: "or", conditions })),
  };
});

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  isNull: mocks.isNull,
  lt: mocks.lt,
  or: mocks.or,
}));

vi.mock("../db/schema", () => ({
  stripeEvents: {
    eventId: { name: "event_id" },
    status: { name: "status" },
    processedAt: { name: "processed_at" },
  },
}));

vi.mock("../lib/server-context", () => ({
  drizzle: { delete: mocks.deleteClaim },
  log: { warn: mocks.warn, error: mocks.error },
}));

vi.mock("../lib/stripe-helpers", () => ({
  stripeAvailable: () => true,
  stripe: { webhooks: { constructEvent: mocks.constructEvent } },
}));

import { reclaimAbandonedStripeWebhookClaim } from "./stripe-webhook-claim-preflight";

describe("reclaimAbandonedStripeWebhookClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.where.mockImplementation(() => ({ returning: mocks.returning }));
    mocks.deleteClaim.mockImplementation(() => ({ where: mocks.where }));
  });

  it("verifies the signature, atomically deletes a stale claim, and continues", async () => {
    const body = Buffer.from('{"id":"evt_stale"}');
    mocks.constructEvent.mockReturnValue({
      id: "evt_stale",
      type: "checkout.session.completed",
    });
    mocks.returning.mockResolvedValue([{ eventId: "evt_stale" }]);

    await reclaimAbandonedStripeWebhookClaim(
      {
        method: "POST",
        body,
        headers: { "stripe-signature": "t=1,v1=valid" },
      } as never,
      {} as never,
      mocks.next,
    );

    expect(mocks.constructEvent).toHaveBeenCalledWith(body, "t=1,v1=valid", "whsec_test");
    expect(mocks.deleteClaim).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), "evt_stale");
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), "processing");
    expect(mocks.isNull).toHaveBeenCalledTimes(1);
    expect(mocks.lt).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      "Reclaimed abandoned Stripe webhook claim before canonical handling",
      { eventId: "evt_stale", eventType: "checkout.session.completed" },
    );
    expect(mocks.next).toHaveBeenCalledWith();
  });

  it("continues without logging when no stale claim exists", async () => {
    mocks.constructEvent.mockReturnValue({ id: "evt_new", type: "invoice.paid" });
    mocks.returning.mockResolvedValue([]);

    await reclaimAbandonedStripeWebhookClaim(
      {
        method: "POST",
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "valid" },
      } as never,
      {} as never,
      mocks.next,
    );

    expect(mocks.deleteClaim).toHaveBeenCalledTimes(1);
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledWith();
  });

  it("never touches claim state when Stripe rejects the signature", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    await reclaimAbandonedStripeWebhookClaim(
      {
        method: "POST",
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "invalid" },
      } as never,
      {} as never,
      mocks.next,
    );

    expect(mocks.deleteClaim).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledWith();
  });

  it("skips non-POST and non-buffer requests", async () => {
    await reclaimAbandonedStripeWebhookClaim(
      { method: "GET", body: Buffer.from("{}"), headers: {} } as never,
      {} as never,
      mocks.next,
    );
    await reclaimAbandonedStripeWebhookClaim(
      { method: "POST", body: {}, headers: { "stripe-signature": "valid" } } as never,
      {} as never,
      mocks.next,
    );

    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.deleteClaim).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the idempotency store is unavailable", async () => {
    mocks.constructEvent.mockReturnValue({ id: "evt_db", type: "invoice.paid" });
    mocks.returning.mockRejectedValue(new Error("database unavailable"));

    await reclaimAbandonedStripeWebhookClaim(
      {
        method: "POST",
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "valid" },
      } as never,
      {} as never,
      mocks.next,
    );

    expect(mocks.error).toHaveBeenCalledWith(
      "Stripe stale-claim preflight failed closed",
      expect.objectContaining({
        eventId: "evt_db",
        eventType: "invoice.paid",
        error: "database unavailable",
      }),
    );
    expect(mocks.next).toHaveBeenCalledTimes(1);
    expect(mocks.next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
