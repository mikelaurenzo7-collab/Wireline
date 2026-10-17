import { beforeEach, describe, expect, it, vi } from "vitest";

const shopify = vi.hoisted(() => ({
  lookupOrder: vi.fn(),
  lookupCustomer: vi.fn(),
  cancelOrder: vi.fn(),
  updateOrderShippingAddress: vi.fn(),
  startReturn: vi.fn(),
  addOrderNote: vi.fn(),
  searchProducts: vi.fn(),
  createDraftOrder: vi.fn(),
}));
const crm = vi.hoisted(() => ({
  searchContacts: vi.fn(),
  logCall: vi.fn(),
  createOpportunity: vi.fn(),
  updateDealStage: vi.fn(),
}));
const square = vi.hoisted(() => ({
  squareLookupOrder: vi.fn(),
  squareLookupCustomer: vi.fn(),
  squareCheckInventory: vi.fn(),
  squareCreatePaymentLink: vi.fn(),
}));

vi.mock("../src/lib/shopify-service", () => shopify);
vi.mock("../src/lib/crm-service", () => ({
  CRMService: vi.fn(function CRMService() {
    return {
      searchContacts: crm.searchContacts,
      logCall: crm.logCall,
      createOpportunity: crm.createOpportunity,
      updateDealStage: crm.updateDealStage,
    };
  }),
}));
vi.mock("../src/lib/square-service", () => square);
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
import { handleSquareToolCall } from "../src/lib/bot-tools/square";
import { handleWorkflowToolCall } from "../src/lib/bot-tools/workflow";
import { callerPhoneKey } from "../src/lib/caller-phone-match";

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

const PRIVATE_READ_REFUSAL =
  "I can't safely verify this caller for private account details during this call. No records were shared. Offer a team follow-up.";
const CALLER_LINKED_WRITE_REFUSAL =
  "I can't safely verify this caller to change an existing record or schedule an automatic callback. No records were changed and no callback was scheduled. Offer a team follow-up.";
const SQUARE_PAYMENT_LINK_REFUSAL =
  "I can't verify a Square checkout amount from the caller's request. No payment link was created. Offer a team follow-up to confirm the item and price.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Shopify order changes on a live call", () => {
  it.each([
    "shopify_cancel_order",
    "shopify_update_address",
    "shopify_start_return",
    "shopify_add_order_note",
  ])("%s never changes an existing order based only on caller ID", async (tool) => {
    const result = await handleShopifyToolCall(
      tool,
      { order_id: "5001", reason: "wrong size", address1: "1 Elsewhere Rd", note: "urgent" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("No change was made");
    expect(shopify.cancelOrder).not.toHaveBeenCalled();
    expect(shopify.updateOrderShippingAddress).not.toHaveBeenCalled();
    expect(shopify.startReturn).not.toHaveBeenCalled();
    expect(shopify.addOrderNote).not.toHaveBeenCalled();
  });

  it("does not use an apparently linked caller number as mutation authorization", async () => {
    const result = await handleShopifyToolCall(
      "shopify_cancel_order",
      { order_id: "5001" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("No change was made");
    expect(shopify.cancelOrder).not.toHaveBeenCalled();
  });

  it("does not access the store for an arbitrary order id", async () => {
    const result = await handleShopifyToolCall(
      "shopify_cancel_order",
      { order_id: "5001/fulfillments/7" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("No change was made");
    expect(shopify.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("Shopify lookups on a live call", () => {
  it("withholds order details from a caller who only knows the order number", async () => {
    shopify.lookupOrder.mockResolvedValue(order);
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001" },
      liveCall("+15125550100"),
    );

    expect(result?.result).toContain("email");
    expect(result?.result).not.toContain("#1001");
    expect(result?.result).not.toContain("owner@customer.co");
    expect(result?.result).not.toContain("Boots");
    expect(shopify.lookupOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["gift recipient shipping phone", "+15125550142"],
    ["spoofed caller ID", "+15125550142"],
  ])("does not reveal an order to the %s without its email", async (_scenario, callerNumber) => {
    shopify.lookupOrder.mockResolvedValue(order);
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001" },
      liveCall(callerNumber),
    );

    expect(result?.result).not.toContain("Boots");
    expect(result?.result).not.toContain("#1001");
    expect(shopify.lookupOrder).not.toHaveBeenCalled();
  });

  it("requires an order number before querying Shopify", async () => {
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { email: "owner@customer.co" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("order number");
    expect(shopify.lookupOrder).not.toHaveBeenCalled();
  });

  it("does not disclose a different order returned by a failed lookup", async () => {
    shopify.lookupOrder.mockResolvedValue(null);
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1002", email: "owner@customer.co" },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("couldn't verify an order");
    expect(result?.result).not.toContain("#1001");
    expect(result?.result).not.toContain("Boots");
  });

  it("does not treat an email alone as proof", async () => {
    shopify.lookupOrder.mockResolvedValue(order);
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { email: "owner@customer.co" },
      liveCall(null),
    );

    expect(result?.result).not.toContain("Boots");
    expect(shopify.lookupOrder).not.toHaveBeenCalled();
  });

  it("shares a concise order summary only with exact order number and matching email", async () => {
    shopify.lookupOrder.mockResolvedValueOnce(order);
    const result = await handleShopifyToolCall(
      "shopify_lookup_order",
      { order_number: "1001", email: "owner@customer.co" },
      liveCall(null),
    );

    expect(result?.result).toContain("Items: 1x Boots");
    expect(result?.result).not.toContain("owner@customer.co");
    expect(result?.result).not.toContain("[data:");
    expect(shopify.lookupOrder).toHaveBeenCalledExactlyOnceWith({
      orderNumber: "1001",
      email: "owner@customer.co",
      userId: "tenant-1",
    });
  });

  it("does not read a customer profile based only on caller ID", async () => {
    shopify.lookupCustomer.mockResolvedValue({
      first_name: "Private",
      last_name: "Customer",
      email: "private@customer.co",
    });
    const result = await handleShopifyToolCall(
      "shopify_lookup_customer",
      { email: "someone-else@customer.co", phone: "+15125550199" },
      liveCall("+15125550142"),
    );

    expect(result?.result).not.toContain("Private Customer");
    expect(result?.result).not.toContain("private@customer.co");
    expect(shopify.lookupCustomer).not.toHaveBeenCalled();
  });
});

describe("Shopify draft orders on a live call", () => {
  it("refuses a custom title and price without a catalog variant", async () => {
    const result = await handleShopifyToolCall(
      "shopify_create_draft_order",
      { title: "Private discount", price: "0.01", quantity: 1 },
      liveCall("+15125550142"),
    );

    expect(result?.result).toContain("no draft was created");
    expect(shopify.createDraftOrder).not.toHaveBeenCalled();
  });

  it("ignores model supplied custom price when drafting a catalog variant", async () => {
    shopify.createDraftOrder.mockResolvedValue({ ok: true, message: "Draft created." });
    await handleShopifyToolCall(
      "shopify_create_draft_order",
      { variant_id: "123456", quantity: 2, title: "Private discount", price: "0.01" },
      liveCall("+15125550142"),
    );

    expect(shopify.createDraftOrder).toHaveBeenCalledExactlyOnceWith({
      lineItems: [{ variantId: "123456", quantity: 2 }],
      customer: undefined,
      userId: "tenant-1",
    });
  });
});

describe("caller phone matching", () => {
  it("does not collapse different country codes with the same final ten digits", () => {
    const us = "+1 202 555 0123";
    const uk = "+44 202 555 0123";

    expect(callerPhoneKey(us)).not.toBe(callerPhoneKey(uk));
    expect(callerPhoneKey("(202) 555-0123")).toBe(callerPhoneKey(us));
  });
});

describe("private live voice reads", () => {
  it("refuses all five direct handler calls without reading a database or provider", async () => {
    const select = vi.fn();
    const context = liveCall("+12025550123", { select });
    crm.searchContacts.mockResolvedValue({
      contacts: [{ first_name: "Private", email: "private@example.com" }],
    });
    square.squareLookupOrder.mockResolvedValue({
      id: "private-order",
      lineItems: [{ name: "Private item", quantity: 1 }],
    });
    square.squareLookupCustomer.mockResolvedValue({
      firstName: "Private",
      email: "private@example.com",
    });

    const results = await Promise.all([
      handleCoreToolCall("search_leads", { query: "all customers" }, context),
      handleEnrichmentToolCall("crm_search_contacts", { query: "all customers" }, context),
      handleWorkflowToolCall("view_recent_interactions", {}, context),
      handleSquareToolCall("square_lookup_order", { order_id: "private-order" }, context),
      handleSquareToolCall("square_lookup_customer", { email: "private@example.com" }, context),
    ]);

    for (const result of results) expect(result?.result).toBe(PRIVATE_READ_REFUSAL);
    expect(select).not.toHaveBeenCalled();
    expect(crm.searchContacts).not.toHaveBeenCalled();
    expect(square.squareLookupOrder).not.toHaveBeenCalled();
    expect(square.squareLookupCustomer).not.toHaveBeenCalled();
  });
});

describe("unverified live voice writes", () => {
  it("refuses lead, CRM, callback, and quick-pay actions before any mutation or provider request", async () => {
    const db = { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
    const context = liveCall("+12025550123", db);
    crm.logCall.mockResolvedValue("private-log-id");
    square.squareCreatePaymentLink.mockResolvedValue({ url: "https://private.example/pay" });

    const [leadStatus, crmLog, callback, paymentLink] = await Promise.all([
      handleCoreToolCall("update_lead_status", { status: "qualified" }, context),
      handleEnrichmentToolCall(
        "crm_log_call",
        { contact_id: "someone-else", subject: "Private call" },
        context,
      ),
      handleWorkflowToolCall(
        "schedule_callback",
        { callback_datetime: "2026-10-18T12:00:00-05:00", notes: "automatic callback" },
        context,
      ),
      handleSquareToolCall(
        "square_create_payment_link",
        { title: "Arbitrary item", amount_dollars: 0.01 },
        context,
      ),
    ]);

    expect(leadStatus?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(crmLog?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(callback?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(paymentLink?.result).toBe(SQUARE_PAYMENT_LINK_REFUSAL);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(crm.logCall).not.toHaveBeenCalled();
    expect(square.squareCreatePaymentLink).not.toHaveBeenCalled();
  });
});

describe("lead and CRM lookups on a live call", () => {
  function leadDb(rows: unknown[]) {
    const where = vi.fn().mockResolvedValue(rows);
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
    return { db: { select }, select, where };
  }

  it("does not expose a matching lead record to an unverified live caller", async () => {
    const { db, select } = leadDb([
      {
        id: "maya",
        name: "Maya Brooks",
        status: "new",
        customerNumber: "+15125550142",
        context: "",
      },
    ]);
    const result = await handleCoreToolCall(
      "search_leads",
      { query: "anyone named John" },
      liveCall("+15125550142", db),
    );

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).not.toContain("Maya Brooks");
  });

  it("does not search fuzzy or cross-country lead candidates", async () => {
    const { db, select } = leadDb([
      {
        id: "other",
        name: "Other country",
        status: "new",
        customerNumber: "+44 202 555 0123",
        context: "",
      },
      {
        id: "substring",
        name: "Substring",
        status: "new",
        customerNumber: "+1 9202 555 0123",
        context: "",
      },
      {
        id: "caller",
        name: "Caller",
        status: "new",
        customerNumber: "+1 (202) 555-0123",
        context: "",
      },
    ]);
    const result = await handleCoreToolCall("search_leads", {}, liveCall("+12025550123", db));

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).not.toContain("Caller");
    expect(result?.result).not.toContain("Other country");
    expect(result?.result).not.toContain("Substring");
  });

  it("does not write the status of a fuzzy or cross-country lead candidate", async () => {
    const { db, select } = leadDb([
      { id: "other-country", customerNumber: "+44 202 555 0123" },
      { id: "substring", customerNumber: "+1 9202 555 0123" },
    ]);
    const update = vi.fn();
    const result = await handleCoreToolCall(
      "update_lead_status",
      { status: "qualified", notes: "asked about pricing" },
      liveCall("+12025550123", { ...db, update }),
    );

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(update).not.toHaveBeenCalled();
  });

  it("withholds ambiguous same-number leads and does not update either status", async () => {
    const { db } = leadDb([
      { id: "lead-a", name: "Avery", status: "new", customerNumber: "+1 202 555 0123" },
      { id: "lead-b", name: "Blair", status: "new", customerNumber: "(202) 555-0123" },
    ]);
    const update = vi.fn();
    const context = liveCall("+12025550123", { ...db, update });

    const read = await handleCoreToolCall("search_leads", {}, context);
    const write = await handleCoreToolCall("update_lead_status", { status: "qualified" }, context);

    expect(read?.result).not.toContain("Avery");
    expect(read?.result).not.toContain("Blair");
    expect(write?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a lead lookup when the call has no caller number", async () => {
    const { db, select } = leadDb([]);
    const result = await handleCoreToolCall("search_leads", { query: "John" }, liveCall(null, db));

    expect(result?.result).not.toContain("John");
    expect(select).not.toHaveBeenCalled();
  });

  it("does not search CRM contacts by caller number or model query", async () => {
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

    expect(crm.searchContacts).not.toHaveBeenCalled();
    expect(anonymous?.result).not.toContain("Acme");
  });

  it("does not disclose exact, fuzzy, or cross-country CRM matches", async () => {
    crm.searchContacts.mockResolvedValue({
      contacts: [
        {
          hs_id: "other",
          first_name: "Other",
          email: "other@example.com",
          phone: "+44 202 555 0123",
        },
        {
          hs_id: "substring",
          first_name: "Substring",
          email: "substring@example.com",
          phone: "+1 9202 555 0123",
        },
        {
          hs_id: "caller",
          first_name: "Caller",
          email: "caller@example.com",
          phone: "+1 (202) 555-0123",
        },
      ],
    });
    const result = await handleEnrichmentToolCall(
      "crm_search_contacts",
      { query: "all contacts" },
      liveCall("+12025550123"),
    );

    expect(crm.searchContacts).not.toHaveBeenCalled();
    expect(result?.result).not.toContain("caller@example.com");
    expect(result?.result).not.toContain("other@example.com");
    expect(result?.result).not.toContain("substring@example.com");
  });

  it("withholds ambiguous same-number CRM contacts", async () => {
    crm.searchContacts.mockResolvedValue({
      contacts: [
        {
          hs_id: "avery",
          first_name: "Avery",
          email: "avery@example.com",
          phone: "+1 202 555 0123",
        },
        {
          hs_id: "blair",
          first_name: "Blair",
          email: "blair@example.com",
          phone: "(202) 555-0123",
        },
      ],
    });
    const result = await handleEnrichmentToolCall(
      "crm_search_contacts",
      {},
      liveCall("+12025550123"),
    );

    expect(result?.result).not.toContain("avery@example.com");
    expect(result?.result).not.toContain("blair@example.com");
    expect(crm.searchContacts).not.toHaveBeenCalled();
  });

  it("does not log a CRM call even with a model supplied contact id", async () => {
    crm.logCall.mockResolvedValue(null);
    const result = await handleEnrichmentToolCall(
      "crm_log_call",
      { subject: "Follow up", contact_id: "someone-else", notes: "caller note" },
      liveCall("+12025550123"),
    );

    expect(crm.logCall).not.toHaveBeenCalled();
    expect(result?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
  });

  it.each(["crm_create_opportunity", "crm_update_deal_stage"])(
    "%s refuses a model supplied CRM record id",
    async (tool) => {
      const result = await handleEnrichmentToolCall(
        tool,
        { contact_id: "unrelated-contact", deal_id: "unrelated-deal", stage: "closed won" },
        liveCall("+12025550123"),
      );

      expect(result?.result).toContain("No ");
      expect(crm.createOpportunity).not.toHaveBeenCalled();
      expect(crm.updateDealStage).not.toHaveBeenCalled();
    },
  );
});
