import { describe, expect, it } from "vitest";
import { auditStripeCatalog } from "../scripts/audit-stripe-catalog-live.mjs";
import { FOUNDER_PRICES, FOUNDER_PRODUCTS } from "../scripts/lib/stripe-founder-catalog.mjs";

function catalogFixture() {
  const products = FOUNDER_PRODUCTS.map((spec) => ({
    ...spec,
    id: `prod_${spec.key}`,
    active: true,
  }));
  const prices = FOUNDER_PRICES.map((spec) => ({
    id: `price_${spec.key}`,
    product: `prod_${spec.productKey}`,
    active: true,
    currency: "usd",
    unit_amount: spec.unitAmount,
    recurring: spec.recurring,
    lookup_key: spec.lookupKey,
    metadata: { ...spec.metadata, wireline_price_key: spec.key },
  }));
  const env = Object.fromEntries(
    FOUNDER_PRICES.filter((spec) => spec.envTarget).map((spec) => [
      spec.envTarget,
      `price_${spec.key}`,
    ]),
  );
  const historicalProduct = {
    id: "prod_historical",
    name: "BotBound Starter",
    active: true,
    metadata: { wireline_plan_id: "starter" },
  };
  const historicalPrice = {
    id: "price_historical",
    product: historicalProduct.id,
    active: true,
    metadata: { wireline_plan_id: "starter" },
  };
  const subscriptions = [];
  const paymentLinks = [];
  const checkoutSessions = [];
  const stripe = {
    accounts: { retrieve: async () => ({ id: "acct_fixture" }) },
    products: { list: () => products },
    prices: { list: () => prices.filter((price) => price.active) },
    subscriptions: { list: () => subscriptions },
    paymentLinks: {
      list: () => paymentLinks,
      listLineItems: (id) => paymentLinks.find((link) => link.id === id).lineItems,
    },
    checkout: {
      sessions: {
        list: () => checkoutSessions,
        listLineItems: (id) => checkoutSessions.find((session) => session.id === id).lineItems,
      },
    },
  };
  return {
    stripe,
    env,
    products,
    prices,
    historicalProduct,
    historicalPrice,
    subscriptions,
    paymentLinks,
    checkoutSessions,
  };
}

function audit(fixture) {
  return auditStripeCatalog(fixture.stripe, { env: fixture.env });
}

describe("read-only Stripe catalog audit", () => {
  it("accepts current catalog prices across subscriptions, links, and open checkouts", async () => {
    const fixture = catalogFixture();
    const items = [{ price: fixture.prices[0] }];
    fixture.subscriptions.push({ id: "sub_current", status: "active", items: { data: items } });
    fixture.paymentLinks.push({ id: "plink_current", lineItems: items });
    fixture.checkoutSessions.push({ id: "cs_current", status: "open", lineItems: items });

    expect(await audit(fixture)).toMatchObject({
      canonical_price_count: FOUNDER_PRICES.length,
      live_subscription_count: 1,
      active_payment_link_count: 1,
      open_checkout_session_count: 1,
      findings: [],
    });
  });

  it("retains historical products, prices, and live subscriptions with visible compatibility warnings", async () => {
    const fixture = catalogFixture();
    fixture.products.push(fixture.historicalProduct);
    fixture.prices.push(fixture.historicalPrice);
    fixture.subscriptions.push({
      id: "sub_historical",
      status: "active",
      items: { data: [{ price: fixture.historicalPrice }] },
    });

    const result = await audit(fixture);
    expect(result.findings).toEqual([
      expect.objectContaining({
        level: "warning",
        message: "Historical product retained for read-only compatibility.",
      }),
      expect.objectContaining({
        level: "warning",
        message: "Historical price retained for read-only compatibility.",
      }),
    ]);
    expect(fixture.historicalProduct.active).toBe(true);
    expect(fixture.historicalPrice.active).toBe(true);
    expect(fixture.subscriptions[0].status).toBe("active");
  });

  it.each(["starter", "team", "business", "enterprise"])(
    "rejects a still-active payment link selling a historical %s plan",
    async (planId) => {
      const fixture = catalogFixture();
      fixture.paymentLinks.push({
        id: "plink_retired",
        lineItems: [
          { price: { ...fixture.historicalPrice, metadata: { wireline_plan_id: planId } } },
        ],
      });
      expect((await audit(fixture)).findings).toContainEqual({
        level: "error",
        message: "Active payment link uses a noncanonical price.",
        metadata: { payment_link_id: "plink_retired", price_id: "price_historical" },
      });
    },
  );

  it("rejects an open historical checkout while ignoring completed and expired ones", async () => {
    const fixture = catalogFixture();
    for (const status of ["open", "complete", "expired"]) {
      fixture.checkoutSessions.push({
        id: `cs_${status}`,
        status,
        lineItems: [{ price: fixture.historicalPrice }],
      });
    }
    const result = await audit(fixture);
    expect(result.open_checkout_session_count).toBe(1);
    expect(result.findings).toEqual([
      {
        level: "error",
        message: "Open checkout uses a noncanonical price.",
        metadata: { checkout_session_id: "cs_open", price_id: "price_historical" },
      },
    ]);
  });

  it("does not exempt an arbitrary unexpected product marked retired", async () => {
    const fixture = catalogFixture();
    fixture.products.push({
      id: "prod_unexpected",
      name: "Unreviewed offer",
      active: true,
      metadata: { wireline_catalog_state: "retired" },
    });
    expect((await audit(fixture)).findings).toContainEqual({
      level: "error",
      message: "Unexpected active product: Unreviewed offer",
      metadata: { product_id: "prod_unexpected" },
    });
  });

  it("still rejects superseded current-package prices and unknown live subscription prices", async () => {
    const fixture = catalogFixture();
    const superseded = {
      ...fixture.prices[0],
      id: "price_superseded",
      lookup_key: "old_voice_price",
      metadata: { wireline_plan_id: "voice" },
    };
    fixture.prices.push(superseded);
    fixture.subscriptions.push({
      id: "sub_unknown",
      status: "active",
      items: { data: [{ price: superseded }] },
    });
    const result = await audit(fixture);
    expect(result.findings).toEqual([
      expect.objectContaining({
        level: "error",
        message: "Superseded Wireline price is still active.",
      }),
      {
        level: "error",
        message: "Live subscription uses a noncanonical price.",
        metadata: { subscription_id: "sub_unknown", price_id: "price_superseded" },
      },
    ]);
  });

  it.each(["month", "year"])(
    "rejects active links and open checkouts for a held Email %s interval",
    async (interval) => {
      const fixture = catalogFixture();
      const expected = FOUNDER_PRICES.find(
        (price) => price.productKey === "email" && price.recurring?.interval === interval,
      );
      const price = fixture.prices.find((entry) => entry.id === `price_${expected.key}`);
      delete fixture.env[expected.envTarget];
      const lineItems = [{ price }];
      fixture.paymentLinks.push({ id: "plink_held", lineItems });
      fixture.checkoutSessions.push({ id: "cs_held", status: "open", lineItems });
      // Turning off new sales must not invalidate an already-paid subscription.
      fixture.subscriptions.push({
        id: "sub_existing",
        status: "active",
        items: { data: lineItems },
      });
      expect((await audit(fixture)).findings).toEqual([
        {
          level: "error",
          message: "Active payment link sells a held plan interval.",
          metadata: {
            payment_link_id: "plink_held",
            price_id: price.id,
            env_key: expected.envTarget,
          },
        },
        {
          level: "error",
          message: "Open checkout sells a held plan interval.",
          metadata: {
            checkout_session_id: "cs_held",
            price_id: price.id,
            env_key: expected.envTarget,
          },
        },
      ]);
    },
  );

  it("requires the exact interval price ID, not merely a configured family or nonempty value", async () => {
    const fixture = catalogFixture();
    const expected = FOUNDER_PRICES.find(
      (price) => price.productKey === "voice" && price.recurring?.interval === "year",
    );
    const price = fixture.prices.find((entry) => entry.id === `price_${expected.key}`);
    fixture.env[expected.envTarget] = fixture.env.STRIPE_VOICE_PRICE_ID;
    fixture.paymentLinks.push({ id: "plink_wrong_interval", lineItems: [{ price }] });
    expect((await audit(fixture)).findings).toContainEqual({
      level: "error",
      message: "Active payment link sells a held plan interval.",
      metadata: {
        payment_link_id: "plink_wrong_interval",
        price_id: price.id,
        env_key: expected.envTarget,
      },
    });
  });

  it("preserves canonical one-time topups without enabling recurring plan intervals", async () => {
    const fixture = catalogFixture();
    fixture.env = {};
    const price = fixture.prices.find((entry) => entry.id === "price_balance_25");
    const lineItems = [{ price }];
    fixture.paymentLinks.push({ id: "plink_balance", lineItems });
    fixture.checkoutSessions.push({ id: "cs_balance", status: "open", lineItems });
    expect((await audit(fixture)).findings).toEqual([]);
  });
});
