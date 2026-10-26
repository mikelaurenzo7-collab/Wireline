import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  select: vi.fn(),
  fetchWithTimeout: vi.fn(),
  decryptSecret: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: fixtures.select },
  fetchWithTimeout: fixtures.fetchWithTimeout,
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/secret-vault", () => ({ decryptSecret: fixtures.decryptSecret }));

import { createDraftOrder, lookupOrder } from "../src/lib/shopify-service";

const storeConnection = {
  id: "shopify-connection-1",
  accessToken: "encrypted-token",
  instanceUrl: "https://merchant.myshopify.com",
  metadata: { shop: "merchant.myshopify.com" },
};

const otherOrder = {
  id: 5001,
  name: "#1001",
  email: "owner@customer.co",
  phone: "+44 202 555 0123",
  shipping_address: { phone: "+1 202 555 0123" },
  line_items: [{ title: "Private boots", quantity: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [storeConnection] }) }),
  });
  fixtures.decryptSecret.mockReturnValue("test-token");
  fixtures.fetchWithTimeout.mockResolvedValue(
    new Response(JSON.stringify({ orders: [otherOrder] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

describe("Shopify order lookup privacy", () => {
  it("does not query a store-wide recent-orders list without an order number", async () => {
    const result = await lookupOrder({ email: "owner@customer.co", userId: "tenant-1" });

    expect(result).toBeNull();
    expect(fixtures.select).not.toHaveBeenCalled();
    expect(fixtures.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it.each([
    ["gift recipient shipping phone", "+1 202 555 0123"],
    ["spoofed order phone", "+44 202 555 0123"],
  ])(
    "does not query an order for a %s without the order email",
    async (_scenario, callerNumber) => {
      const attemptedLookup = {
        orderNumber: "1001",
        callerNumber,
        userId: "tenant-1",
      };
      const result = await lookupOrder(attemptedLookup);

      expect(result).toBeNull();
      expect(fixtures.select).not.toHaveBeenCalled();
      expect(fixtures.fetchWithTimeout).not.toHaveBeenCalled();
    },
  );

  it("rejects an unrelated order even if Shopify returns it for a name filter", async () => {
    const result = await lookupOrder({
      orderNumber: "1002",
      email: "owner@customer.co",
      userId: "tenant-1",
    });

    expect(result).toBeNull();
    expect(fixtures.fetchWithTimeout).toHaveBeenCalledOnce();
    const [url] = fixtures.fetchWithTimeout.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("name")).toBe("#1002");
  });

  it("rejects a matching order number with the wrong email", async () => {
    const result = await lookupOrder({
      orderNumber: "1001",
      email: "attacker@customer.co",
      userId: "tenant-1",
    });

    expect(result).toBeNull();
  });

  it("returns the order only for its exact number and email", async () => {
    const result = await lookupOrder({
      orderNumber: "1001",
      email: " OWNER@CUSTOMER.CO ",
      userId: "tenant-1",
    });

    expect(result?.name).toBe("#1001");
    expect(fixtures.fetchWithTimeout).toHaveBeenCalledOnce();
  });

  it("refuses two different store orders that share the same displayed order number", async () => {
    fixtures.fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ orders: [otherOrder, { ...otherOrder, id: 5002 }] }), {
        status: 200,
      }),
    );
    const result = await lookupOrder({
      orderNumber: "1001",
      email: "owner@customer.co",
      userId: "tenant-1",
    });

    expect(result).toBeNull();
  });
});

describe("Shopify draft order pricing", () => {
  it("reports an uncertain provider failure without inventing a human follow-up or retrying", async () => {
    fixtures.fetchWithTimeout.mockRejectedValueOnce(new Error("connection lost after send"));
    const result = await createDraftOrder({
      userId: "tenant-1",
      lineItems: [{ variantId: "123456", quantity: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("draft order was not confirmed");
    expect(result.message).toContain("Check the store before another attempt");
    expect(result.message).toContain("No follow-up task was saved");
    expect(result.message).not.toMatch(/team member will|will follow up/i);
    expect(fixtures.fetchWithTimeout).toHaveBeenCalledOnce();
  });

  it("rejects a custom-priced item without a catalog variant", async () => {
    const attemptedDraft = {
      userId: "tenant-1",
      lineItems: [{ title: "Private discount", price: "0.01", quantity: 1 }],
    };
    const result = await createDraftOrder(
      attemptedDraft as unknown as Parameters<typeof createDraftOrder>[0],
    );

    expect(result.ok).toBe(false);
    expect(fixtures.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("sends only catalog variant and quantity to Shopify", async () => {
    fixtures.fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ draft_order: { id: 9001 } }), { status: 201 }),
    );
    const attemptedDraft = {
      userId: "tenant-1",
      lineItems: [{ variantId: "123456", quantity: 2, title: "Private discount", price: "0.01" }],
    };
    const result = await createDraftOrder(attemptedDraft);

    expect(result.ok).toBe(true);
    const [, options] = fixtures.fetchWithTimeout.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      draft_order: { line_items: [{ variant_id: 123456, quantity: 2 }] },
    });
  });
});
