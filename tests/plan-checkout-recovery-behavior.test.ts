import { getTableColumns, getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Column = { name: string };
type Selection = Record<string, Column>;
type Predicate = (row: Row) => boolean;
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Table = Parameters<typeof getTableName>[0];

const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  rows: {} as Record<string, Row[]>,
  sessions: {} as Record<string, Row>,
  trace: [] as string[],
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  expireSession: vi.fn(),
  createCustomer: vi.fn(),
  ownedCustomer: vi.fn(),
  fulfill: vi.fn(),
}));

vi.mock("express", () => ({
  Router: () => ({
    post: (path: string, ...handlers: Handler[]) => h.routes.set(path, handlers.at(-1)!),
  }),
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq:
      (column: Column, value: unknown): Predicate =>
      (row) =>
        row[column.name] === value,
    and:
      (...conditions: Predicate[]): Predicate =>
      (row) =>
        conditions.every((test) => test(row)),
    inArray:
      (column: Column, values: unknown[]): Predicate =>
      (row) =>
        values.includes(row[column.name]),
    sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
      const column = values[0] as Column;
      const expression = strings.join("");
      if (expression.includes("< clock_timestamp()"))
        return (row: Row) => Number(row[column.name]) < Date.now();
      if (expression.includes("> clock_timestamp()"))
        return (row: Row) => Number(row[column.name]) > Date.now();
      return actual.sql(strings, ...values);
    }, actual.sql),
  };
});
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.select, update: h.update, insert: h.insert },
  log: { error: vi.fn(), warn: vi.fn() },
  auditLogger: { logBilling: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../src/lib/stripe-helpers", () => ({
  stripeAvailable: () => true,
  stripe: {
    customers: { create: h.createCustomer },
    checkout: {
      sessions: { create: h.createSession, retrieve: h.retrieveSession, expire: h.expireSession },
    },
  },
  isMissingStripeResource: (error: { code?: string }) => error.code === "resource_missing",
  stripeCheckoutIntegrationIdentifier: () => "plan-abcdefgh",
  stripeCheckoutTaxConfig: () => ({}),
}));
vi.mock("../src/lib/app-url", () => ({
  resolveCanonicalAppUrl: () => ({ url: "https://botbound.example" }),
}));
vi.mock("../src/lib/stripe-founder-price", () => ({
  resolveStrictFounderPriceId: async () => "price_current",
}));
vi.mock("../src/lib/stripe-customer-binding", () => ({
  resolveOwnedStripeCustomer: h.ownedCustomer,
}));
vi.mock("../src/lib/stripe-subscription-safety", () => ({
  findPotentiallyLiveStripeSubscription: async () => null,
}));
vi.mock("../src/lib/stripe-checkout-fulfillment", () => ({
  fulfillStripeCheckoutSession: h.fulfill,
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEvent: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: () => {} }));
vi.mock("../src/middleware/account-deletion-billing-fence", () => ({
  fencePayableBillingDuringAccountDeletion: () => {},
}));

import "../src/routes/launch-billing-checkout-atomic-routes";

const OPERATIONS = "wireline_checkout_operations";
const USER = "00000000-0000-4000-8000-000000000001";
const OPERATION = "00000000-0000-4000-8000-000000000002";
const DAY = 24 * 60 * 60_000;

function project(row: Row, selection: Selection): Row {
  return Object.fromEntries(
    Object.entries(selection).map(([key, column]) => [key, row[column.name]]),
  );
}

function valuesFor(table: Table, values: Row): Row {
  const columns = getTableColumns(table) as Selection;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [columns[key].name, value]),
  );
}

function operation(overrides: Row = {}): Row {
  const row = {
    id: OPERATION,
    user_id: USER,
    plan_id: "business",
    billing_interval: "month",
    status: "open",
    stripe_customer_id: "cus_owner",
    stripe_checkout_session_id: "cs_existing",
    checkout_url: "https://checkout.stripe.com/c/cs_existing",
    expires_at: new Date(Date.now() + DAY),
    ...overrides,
  };
  h.rows[OPERATIONS].push(row);
  h.sessions.cs_existing = {
    id: "cs_existing",
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    url: row.checkout_url,
    customer: "cus_owner",
    metadata: { wireline_user_id: USER, wireline_checkout_operation_id: OPERATION },
  };
  return row;
}

async function checkout(planId = "business") {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  await h.routes.get("/api/billing/checkout")!(
    {
      user: { id: USER, email: "owner@example.com" },
      body: { plan_id: planId, interval: "month" },
    },
    res,
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
  h.rows = { [OPERATIONS]: [], wireline_subscriptions: [], wireline_settings: [] };
  h.sessions = {};
  h.trace = [];
  h.createCustomer.mockResolvedValue({ id: "cus_owner" });
  h.ownedCustomer.mockResolvedValue({ id: "cus_owner" });
  h.fulfill.mockImplementation(async (session: Row) => {
    const settled = session.payment_status === "paid";
    if (settled) h.rows[OPERATIONS][0].status = "completed";
    return { paymentSettled: settled, subscriptionSynced: settled };
  });
  h.createSession.mockImplementation(async (params: Row) => ({
    ...params,
    id: "cs_new",
    status: "open",
    payment_status: "unpaid",
    url: "https://checkout.stripe.com/c/cs_new",
  }));
  h.retrieveSession.mockImplementation(async (id: string) => {
    h.trace.push(`retrieve:${id}`);
    if (!h.sessions[id]) throw Object.assign(new Error("missing"), { code: "resource_missing" });
    return { ...h.sessions[id] };
  });
  h.expireSession.mockImplementation(async (id: string) => {
    h.trace.push(`expire:${id}`);
    h.sessions[id].status = "expired";
    return h.sessions[id];
  });
  h.select.mockImplementation((selection: Selection) => {
    let table: Table;
    let predicate: Predicate = () => true;
    const query = {
      from(value: Table) {
        table = value;
        return query;
      },
      where(value: Predicate) {
        predicate = value;
        return query;
      },
      async limit(count: number) {
        return h.rows[getTableName(table)]
          .filter(predicate)
          .slice(0, count)
          .map((row) => project(row, selection));
      },
    };
    return query;
  });
  for (const [kind, mock] of [
    ["update", h.update],
    ["insert", h.insert],
  ] as const) {
    mock.mockImplementation((table: Table) => {
      let values: Row = {};
      let predicate: Predicate = () => true;
      let result: Promise<Row[]> | undefined;
      const execute = () =>
        (result ??= Promise.resolve().then(() => {
          const name = getTableName(table);
          const rows = h.rows[name];
          if (kind === "insert") {
            if (
              name === OPERATIONS &&
              rows.some(
                (row) =>
                  row.user_id === values.user_id &&
                  ["creating", "open"].includes(String(row.status)),
              )
            )
              return [];
            const row = { id: `operation-${rows.length + 1}`, ...values };
            rows.push(row);
            return [row];
          }
          return rows.filter(predicate).map((row) => {
            if (name === OPERATIONS) h.trace.push(`local:${values.status}`);
            Object.assign(row, values);
            return { ...row };
          });
        }));
      const query = {
        values(value: Row) {
          values = valuesFor(table, value);
          return query;
        },
        set(value: Row) {
          values = valuesFor(table, value);
          return query;
        },
        where(value: Predicate) {
          predicate = value;
          return query;
        },
        onConflictDoNothing() {
          return query;
        },
        onConflictDoUpdate() {
          return query;
        },
        async returning(selection: Selection) {
          return (await execute()).map((row) => project(row, selection));
        },
        then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      return query;
    });
  }
});

afterEach(() => vi.useRealTimers());

describe("subscription Checkout recovery", () => {
  it("never releases another flow's active reservation, even after its local timeout", async () => {
    const row = operation({
      plan_id: "runtime_balance_cents:2500",
      expires_at: new Date(Date.now() - 1),
    });
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(row.status).toBe("open");
    expect(h.createSession).not.toHaveBeenCalled();
    expect(h.expireSession).not.toHaveBeenCalled();
  });

  it("reuses a still-payable owned session after the local clock has expired", async () => {
    const row = operation({ expires_at: new Date(Date.now() - 1) });
    const res = await checkout();
    expect(h.createSession).not.toHaveBeenCalled();
    expect(row.status).toBe("open");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ reused: true, url: row.checkout_url }),
    );
  });

  it.each(["paid", "unpaid"])(
    "reconciles a completed %s checkout without opening another purchase",
    async (paymentStatus) => {
      operation();
      Object.assign(h.sessions.cs_existing, {
        status: "complete",
        payment_status: paymentStatus,
        url: null,
      });
      const res = await checkout();
      expect(h.fulfill).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(h.createSession).not.toHaveBeenCalled();
      expect(h.rows[OPERATIONS]).toHaveLength(1);
    },
  );

  it("does not regress webhook completion when a resumed request finishes resolving its customer", async () => {
    const row = operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
    });
    h.ownedCustomer.mockImplementation(async () => {
      row.status = "completed";
      return { id: "cus_owner" };
    });
    const res = await checkout();
    expect(row.status).toBe("completed");
    expect(h.createSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("does not regress a concurrent open session when Stripe returns an ambiguous error", async () => {
    const row = operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
    });
    h.createSession.mockImplementation(async () => {
      row.status = "open";
      throw Object.assign(new Error("response lost"), { type: "StripeConnectionError" });
    });
    const res = await checkout();
    expect(row.status).toBe("open");
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("keeps a known payable session reserved when Stripe omits its hosted URL", async () => {
    h.createSession.mockResolvedValue({ id: "cs_new", status: "open", url: null });
    const res = await checkout();
    expect(h.rows[OPERATIONS][0].status).toBe("open");
    expect(h.rows[OPERATIONS][0].stripe_checkout_session_id).toBe("cs_new");
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("keeps the existing Stripe request parameters and idempotency key stable across retries", async () => {
    operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
    });
    h.createSession.mockRejectedValueOnce(
      Object.assign(new Error("response lost"), { type: "StripeConnectionError" }),
    );
    await checkout();
    vi.setSystemTime(new Date(Date.now() + 60 * 60_000));
    await checkout();
    expect(h.createSession.mock.calls).toHaveLength(2);
    expect(h.createSession.mock.calls[0]).toEqual(h.createSession.mock.calls[1]);
    expect(h.createSession.mock.calls[0][1].idempotencyKey).toBe(`wireline-checkout-${OPERATION}`);
    // Changing parameters for a pre-existing key makes Stripe reject recovery.
    expect(h.createSession.mock.calls[0][0]).not.toHaveProperty("expires_at");
  });

  it("keeps an expired unknown-result operation reserved instead of reusing an aged idempotency key", async () => {
    const row = operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
      expires_at: new Date(Date.now() - 1),
    });
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(row.status).toBe("creating");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("refuses a session whose stamped owner does not match the checkout operation", async () => {
    operation({ plan_id: "starter" });
    h.sessions.cs_existing.metadata = {
      wireline_user_id: "another-user",
      wireline_checkout_operation_id: OPERATION,
    };
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(h.expireSession).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("expires a superseded plan remotely before freeing its reservation", async () => {
    operation({ plan_id: "starter" });
    await checkout();
    expect(h.trace.indexOf("expire:cs_existing")).toBeGreaterThan(-1);
    expect(h.trace.indexOf("local:expired")).toBeGreaterThan(h.trace.indexOf("expire:cs_existing"));
    expect(h.createSession).toHaveBeenCalledTimes(1);
  });

  it("preserves the reservation if the old session cannot be expired", async () => {
    const row = operation({ plan_id: "starter" });
    h.expireSession.mockRejectedValue(new Error("payment may have completed"));
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(row.status).toBe("open");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("returns Stripe's current URL instead of an obsolete cached URL", async () => {
    operation();
    h.sessions.cs_existing.url = "https://checkout.stripe.com/c/current";
    const res = await checkout();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ url: h.sessions.cs_existing.url }),
    );
  });

  it.each(["paid", "unpaid"])(
    "reconciles an idempotency replay of a completed %s session",
    async (paymentStatus) => {
      const row = operation({
        status: "creating",
        stripe_checkout_session_id: null,
        checkout_url: null,
      });
      h.createSession.mockResolvedValue({
        id: "cs_existing",
        status: "complete",
        payment_status: paymentStatus,
        url: null,
      });
      const res = await checkout();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(h.fulfill).toHaveBeenCalledTimes(1);
      expect(row.status).toBe(paymentStatus === "paid" ? "completed" : "creating");
    },
  );

  it("preserves the session id for retry if replayed settlement reconciliation fails", async () => {
    const row = operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
    });
    h.createSession.mockResolvedValue({
      id: "cs_existing",
      status: "complete",
      payment_status: "paid",
      url: null,
    });
    h.fulfill.mockRejectedValue(new Error("projection temporarily unavailable"));
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(row.status).toBe("open");
    expect(row.stripe_checkout_session_id).toBe("cs_existing");
  });

  it("keeps completion terminal when a webhook wins before create returns", async () => {
    const row = operation({
      status: "creating",
      stripe_checkout_session_id: null,
      checkout_url: null,
    });
    h.createSession.mockImplementation(async () => {
      row.status = "completed";
      return { id: "cs_existing", status: "open", url: "https://checkout.stripe.com/c/stale" };
    });
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(row.status).toBe("completed");
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.any(String) }));
  });

  it("does not release an open operation that lost its Stripe session reference", async () => {
    const row = operation({ stripe_checkout_session_id: null });
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(row.status).toBe("open");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("does not create or expire anything when Stripe's current state cannot be read", async () => {
    const row = operation();
    h.retrieveSession.mockRejectedValue(new Error("Stripe temporarily unavailable"));
    await expect(checkout()).rejects.toThrow("Stripe temporarily unavailable");
    expect(row.status).toBe("open");
    expect(h.expireSession).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("replaces a confirmed missing session", async () => {
    operation();
    delete h.sessions.cs_existing;
    await checkout();
    expect(h.createSession).toHaveBeenCalledTimes(1);
    expect(h.rows[OPERATIONS][0].status).toBe("expired");
    expect(h.rows[OPERATIONS][1].status).toBe("open");
  });
});
