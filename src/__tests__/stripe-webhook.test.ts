/**
 * Stripe webhook handler contracts.
 *
 * Mirrors the /api/stripe-webhook logic from server.ts without importing
 * the module. Tests signature verification, idempotency, and event dispatch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mirror handler types ──────────────────────────────────────────────────────
type StripeEvent = {
  id: string;
  type: string;
  data: { object: any };
};

type DbClient = {
  insertEvent: (eventId: string, eventType: string) => Promise<{ error: Error | null }>;
  deleteEvent: (eventId: string) => Promise<void>;
};

type WebhookResponse = {
  status: number;
  body: Record<string, unknown>;
};

// Mirror the handler logic
async function handleStripeWebhook(
  rawBody: Buffer | string,
  sig: string | undefined,
  webhookSecret: string,
  constructEvent: (body: Buffer | string, sig: string, secret: string) => StripeEvent,
  db: DbClient,
  syncSubscription: (sub: any) => Promise<void>,
): Promise<WebhookResponse> {
  if (!sig) return { status: 400, body: { error: "Missing stripe-signature header." } };

  let event: StripeEvent;
  try {
    event = constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return { status: 400, body: { error: "Webhook signature verification failed." } };
  }

  const idempotencyKey = event.id;
  let claimed = false;

  const { error: claimErr } = await db.insertEvent(idempotencyKey, event.type);
  if (claimErr) {
    return { status: 200, body: { received: true, duplicate: true } };
  }
  claimed = true;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription({ id: subId });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }
      case "invoice.payment_failed":
        // Status synced by the accompanying subscription.updated — no action needed.
        break;
      default:
        break;
    }
    return { status: 200, body: { received: true } };
  } catch {
    if (claimed) await db.deleteEvent(idempotencyKey);
    return { status: 500, body: { error: "Webhook handler failed" } };
  }
}

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockConstructEvent = vi.fn<(body: Buffer | string, sig: string, secret: string) => StripeEvent>();
const mockInsertEvent = vi.fn<(eventId: string, eventType: string) => Promise<{ error: Error | null }>>();
const mockDeleteEvent = vi.fn<(eventId: string) => Promise<void>>();
const mockSyncSubscription = vi.fn<(sub: any) => Promise<void>>();
const db: DbClient = { insertEvent: mockInsertEvent, deleteEvent: mockDeleteEvent };

const WEBHOOK_SECRET = "whsec_test_secret";
const RAW_BODY = Buffer.from('{"id":"evt_001","type":"customer.subscription.updated"}');
const VALID_SIG = "t=1234,v1=abc";

const makeEvent = (id: string, type: string, obj: any = {}): StripeEvent => ({
  id,
  type,
  data: { object: obj },
});

beforeEach(() => {
  mockConstructEvent.mockReset();
  mockInsertEvent.mockReset();
  mockDeleteEvent.mockReset();
  mockSyncSubscription.mockReset();
  mockInsertEvent.mockResolvedValue({ error: null });
  mockDeleteEvent.mockResolvedValue(undefined);
  mockSyncSubscription.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Stripe webhook — signature verification", () => {
  it("returns 400 when stripe-signature header is absent", async () => {
    const result = await handleStripeWebhook(RAW_BODY, undefined, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(400);
    expect(result.body.error).toBeDefined();
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when constructEvent throws (invalid signature)", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("No signatures found matching"); });
    const result = await handleStripeWebhook(RAW_BODY, "bad-sig", WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(400);
    expect(result.body.error).toBeDefined();
  });

  it("passes raw body verbatim to constructEvent", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("evt_001", "customer.subscription.updated", { id: "sub_1" }));
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockConstructEvent).toHaveBeenCalledWith(RAW_BODY, VALID_SIG, WEBHOOK_SECRET);
  });
});

describe("Stripe webhook — idempotency", () => {
  it("returns 200 { received: true, duplicate: true } for a duplicate event", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("evt_dup", "customer.subscription.updated", { id: "sub_1" }));
    mockInsertEvent.mockResolvedValue({ error: new Error("duplicate key value") });
    const result = await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(200);
    expect(result.body.duplicate).toBe(true);
    expect(mockSyncSubscription).not.toHaveBeenCalled();
  });

  it("does NOT call syncSubscription for duplicate events", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("evt_dup2", "customer.subscription.updated", { id: "sub_1" }));
    mockInsertEvent.mockResolvedValue({ error: new Error("unique constraint") });
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockSyncSubscription).not.toHaveBeenCalled();
  });

  it("releases the idempotency claim when the handler throws", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("evt_err", "customer.subscription.updated", { id: "sub_1" }));
    mockSyncSubscription.mockRejectedValue(new Error("DB exploded"));
    const result = await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(500);
    expect(mockDeleteEvent).toHaveBeenCalledWith("evt_err");
  });
});

describe("Stripe webhook — event routing", () => {
  it("calls syncSubscription for customer.subscription.updated", async () => {
    const sub = { id: "sub_1", status: "active" };
    mockConstructEvent.mockReturnValue(makeEvent("evt_001", "customer.subscription.updated", sub));
    const result = await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(200);
    expect(mockSyncSubscription).toHaveBeenCalledWith(sub);
    expect(result.body.duplicate).toBeUndefined();
  });

  it("calls syncSubscription for customer.subscription.created", async () => {
    const sub = { id: "sub_2", status: "trialing" };
    mockConstructEvent.mockReturnValue(makeEvent("evt_002", "customer.subscription.created", sub));
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockSyncSubscription).toHaveBeenCalledWith(sub);
  });

  it("calls syncSubscription for customer.subscription.deleted", async () => {
    const sub = { id: "sub_3", status: "canceled" };
    mockConstructEvent.mockReturnValue(makeEvent("evt_003", "customer.subscription.deleted", sub));
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockSyncSubscription).toHaveBeenCalledWith(sub);
  });

  it("does NOT call syncSubscription for invoice.payment_failed (status synced by subscription.updated)", async () => {
    const inv = { customer: "cus_1", status: "open" };
    mockConstructEvent.mockReturnValue(makeEvent("evt_004", "invoice.payment_failed", inv));
    const result = await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(200);
    expect(mockSyncSubscription).not.toHaveBeenCalled();
  });

  it("handles unknown event types gracefully with 200", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("evt_005", "charge.succeeded", {}));
    const result = await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(mockSyncSubscription).not.toHaveBeenCalled();
  });

  it("retrieves subscription ID from checkout.session.completed", async () => {
    const session = { mode: "subscription", subscription: "sub_checkout_1" };
    mockConstructEvent.mockReturnValue(makeEvent("evt_006", "checkout.session.completed", session));
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockSyncSubscription).toHaveBeenCalledWith({ id: "sub_checkout_1" });
  });

  it("skips syncSubscription for checkout.session.completed when mode is not subscription", async () => {
    const session = { mode: "payment", subscription: null };
    mockConstructEvent.mockReturnValue(makeEvent("evt_007", "checkout.session.completed", session));
    await handleStripeWebhook(RAW_BODY, VALID_SIG, WEBHOOK_SECRET, mockConstructEvent, db, mockSyncSubscription);
    expect(mockSyncSubscription).not.toHaveBeenCalled();
  });
});
