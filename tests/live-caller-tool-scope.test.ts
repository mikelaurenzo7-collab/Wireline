import { beforeEach, describe, expect, it, vi } from "vitest";

const shopify = vi.hoisted(() => ({
  lookupOrder: vi.fn(),
  lookupCustomer: vi.fn(),
  cancelOrder: vi.fn(),
  updateOrderShippingAddress: vi.fn(),
  startReturn: vi.fn(),
  orderChangeCallerVerified: vi.fn(),
  searchProducts: vi.fn(),
  createDraftOrder: vi.fn(),
  addOrderNote: vi.fn(),
}));
const crm = vi.hoisted(() => ({ searchContacts: vi.fn() }));

vi.mock("../src/lib/shopify-service", () => shopify);
vi.mock("../src/lib/crm-service", () => ({
  CRMService: vi.fn(function CRMService() {
    return { searchContacts: crm.searchContacts };
  }),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn().mockResolvedValue(undefined),
  assertExternalEntityActionAllowed: vi.fn().mockResolvedValue(undefined),
  liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
  externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
}));

import type { ToolCallContext } from "../src/lib/agent-tool-types";
import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import { handleEnrichmentToolCall } from "../src/lib/bot-tools/enrichment";
import { handleShopifyToolCall } from "../src/lib/bot-tools/shopify";

const quietLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function liveCall(callerNumber: string | null, drizzle: unknown = {}): ToolCallContext {
  const call = {
    id: "call-1",
    type: "inboundPhoneCall",
    provider: "openai",
    customer: { number: callerNumber },
  };
  return {
    toolCallId: "tool-1",
    payload: { call },
    message: { type: "tool-calls", call },
    agent: { id: "agent-1", user_id: "tenant-1" },
    webhookAgentId: "agent-1",
    drizzle,
    log: quietLog,
  } as unknown as ToolCallContext;
}

const order = {
  id: "5001",
  name: "#1001",
  status: "open",
  financial_status: "paid",
  fulfillment_status: "unfulfilled",
  tracking: [],
  line_items: [{ title: "Boots", quantity: 1, sku: null }],
  total: "120.00",
  currency: "USD",
  customer_email: "owner@customer.co",
};

beforeEach(() => {
  vi.clearAllMocks();
  shopify.cancelOrder.mockResolvedValue({ ok: true, message: "Order cancelled." });
  shopify.updateOrderShippingAddress.mockResolvedValue({ ok: true, message: "Address updated." });
  shopify.startReturn.mockResolvedValue({ ok: true, message: "Return started." });
});

describe("Shopify order changes on a live call", () => {
  it.each(["shopify_cancel_order", "shopify_update_address", "shopify_start_return"])(
    "%s refuses a caller whose number is not on the order",
    async (tool) => {
      shopify.orderChangeCallerVerified.mockResolvedValue(false);
      const result = await handleShopifyToolCall(
        tool,
        { order_id: "5001", reason: "wrong size", address1: "1 Elsewhere Rd" },
        liveCall("+15125550100"),
      );

      expect(result?.result).toContain("no change was made");
      expect(shopify.orderChangeCallerVerified).toHaveBeenCalledWith({
        orderId: "5001",
        callerNumber: "+15125550100",
        userId: "tenant-1",
      });
      expect(shopify.cancelOrder).not.toHaveBeenCalled();
      expect(shopify.updateOrderShippingAddress).not.toHaveBeenCalled();
      expect(shopify.startReturn).not.toHaveBeenCalled();
    },
  );

  it("cancels only when the caller is calling from the order's phone number", async () => {
    shopify.orderChangeCallerVerified.mockResolvedValue(true);
    const result = await handleShopifyToolCall(
      "shopify_cancel_order",
      { order_id: "5001" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toBe("Order cancelled.");
    expect(shopify.cancelOrder).toHaveBeenCalledWith({ orderId: "5001", userId: "tenant-1" });
  });

  it("rejects an order id that is not a Shopify numeric id before any store call", async () => {
    const result = await handleShopifyToolCall(
      "shopify_cancel_order",
      { order_id: "5001/fulfillments/7" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("numeric ID");
    expect(shopify.orderChangeCallerVerified).not.toHaveBeenCalled();
    expect(shopify.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("Shopify lookups on a live call", () => {
  it("withholds order details from a caller who only knows the order number", async () => {
    shopify.lookupOrder.mockResolvedValue({ ...order, verified_by: null });
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001" },
      liveCall("+15125550100"),
    );

    expect(result?.result).toContain("only after the caller confirms it");
    expect(result?.result).not.toContain("owner@customer.co");
    expect(result?.result).not.toContain("Boots");
  });

  it("does not treat an email used as the search key as proof", async () => {
    shopify.lookupOrder.mockResolvedValue({ ...order, verified_by: "email" });
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { email: "owner@customer.co" },
      liveCall(null),
    );

    expect(result?.result).not.toContain("Boots");
  });

  it("shares details with the order number plus the order's email, or from the order's phone", async () => {
    shopify.lookupOrder.mockResolvedValueOnce({ ...order, verified_by: "email" });
    const byEmail = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001", email: "owner@customer.co" },
      liveCall(null),
    );
    shopify.lookupOrder.mockResolvedValueOnce({ ...order, verified_by: "phone" });
    const byPhone = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001" },
      liveCall("+15125550142"),
    );

    expect(byEmail?.result).toContain("Items: 1x Boots");
    expect(byPhone?.result).toContain("Items: 1x Boots");
    expect(shopify.lookupOrder).toHaveBeenLastCalledWith({
      orderNumber: "1001",
      email: undefined,
      callerNumber: "+15125550142",
      userId: "tenant-1",
    });
  });

  it("looks up only the caller's own customer profile", async () => {
    shopify.lookupCustomer.mockResolvedValue(null);
    await handleShopifyToolCall(
      "shopify_lookup_customer",
      { email: "someone-else@customer.co", phone: "+15125550199" },
      liveCall("+15125550142"),
    );
    const anonymous = await handleShopifyToolCall(
      "shopify_lookup_customer",
      { email: "someone-else@customer.co" },
      liveCall(null),
    );

    expect(shopify.lookupCustomer).toHaveBeenCalledExactlyOnceWith({
      phone: "+15125550142",
      userId: "tenant-1",
    });
    expect(anonymous?.result).toContain("no caller number");
  });
});

describe("order caller verification", () => {
  it("matches caller ID against any phone on the order, and email only exactly", async () => {
    const { orderCallerVerification } = await vi.importActual<
      typeof import("../src/lib/shopify-service")
    >("../src/lib/shopify-service");
    const raw = {
      phone: null,
      customer: { phone: "(512) 555-0142" },
      shipping_address: { phone: "+1 512 555 0177" },
      email: "Owner@Customer.co",
    };

    expect(orderCallerVerification(raw, { callerNumber: "+15125550142" })).toBe("phone");
    expect(orderCallerVerification(raw, { callerNumber: "+15125550177" })).toBe("phone");
    expect(
      orderCallerVerification(raw, { callerNumber: "+15125550100", email: " owner@customer.co" }),
    ).toBe("email");
    expect(
      orderCallerVerification(raw, { callerNumber: "+15125550100", email: "someone@else.co" }),
    ).toBeNull();
    expect(orderCallerVerification(raw, { callerNumber: null })).toBeNull();
    expect(orderCallerVerification({ phone: "" }, { callerNumber: "" })).toBeNull();
  });
});

describe("lead and CRM lookups on a live call", () => {
  function leadDb(rows: unknown[]) {
    const where = vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) }));
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
    return { db: { select }, select, where };
  }

  it("returns only the caller's own lead record, whatever the model asks for", async () => {
    const { db, select } = leadDb([
      { name: "Maya Brooks", status: "new", customerNumber: "+15125550142", context: "" },
    ]);
    const result = await handleCoreToolCall(
      "search_leads",
      { query: "anyone named John" },
      liveCall("+15125550142", db),
    );

    expect(select).toHaveBeenCalledOnce();
    expect(result?.result).toContain("Maya Brooks");
  });

  it("refuses a lead lookup when the call has no caller number", async () => {
    const { db, select } = leadDb([]);
    const result = await handleCoreToolCall("search_leads", { query: "John" }, liveCall(null, db));

    expect(result?.result).toContain("no caller number");
    expect(select).not.toHaveBeenCalled();
  });

  it("searches the CRM by the caller's number instead of the model's query", async () => {
    crm.searchContacts.mockResolvedValue({ contacts: [] });
    await handleEnrichmentToolCall(
      "crm_search_contacts",
      { query: "all contacts at Acme" },
      liveCall("+15125550142"),
    );
    const anonymous = await handleEnrichmentToolCall(
      "crm_search_contacts",
      { query: "all contacts at Acme" },
      liveCall(null),
    );

    expect(crm.searchContacts).toHaveBeenCalledExactlyOnceWith("+15125550142");
    expect(anonymous?.result).toContain("no caller number");
  });
});
